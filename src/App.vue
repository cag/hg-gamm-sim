<template>
  <div>
    <section>
      <div class="condition" v-for="(condition, index) in conditions" :key="`outcomeRank${index}`">
        <ul>
          <li v-for="slot in condition" :key="slot">
            {{ slot }}
          </li>
        </ul>
      </div>
    </section>
    <label>Initial funding: <input v-model.number="funding"></label>
    <div><vue-mathjax :formula="`$b=${this.mpf(funding)}$`"></vue-mathjax></div>
    <section class="outcomes">
      <div class="outcome-rank" v-for="(outcomeRank, index) in outcomes" :key="`outcomeRank${index}`">
        <ul>
          <li v-for="outcome in outcomeRank" :key="outcome.name">
            {{ outcome.name }}
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script>

import {VueMathjax} from 'vue-mathjax'
import {combinations} from '@aureooms/js-itertools/src/map/combinations.js'
import {product} from '@aureooms/js-itertools/src/map/product.js'

const conditions = [
  ['A', 'B', 'C'],
  ['X', 'Y', 'Z'],
  ['i', 'j', 'k'],
]

const outcomes = [
  [{name: '$', children: []}],
]

const outcomesByName = {}
outcomesByName[outcomes[0][0].name] = outcomes[0][0]

for (let n = 1; n <= conditions.length; n++) {
  const conditionOutcomes = []
  outcomes.push(conditionOutcomes)
  for(const conditionTuple of combinations(conditions, n)) {
    for(const elems of product(conditionTuple)) {
      const outcomeName = elems.join("")
      const outcome = {name: outcomeName, children: []}
      conditionOutcomes.push(outcome)
      outcomesByName[outcomeName] = outcome

      const parentOutcomes = n === 1 ? [outcomesByName['$']] :
        Array.from(combinations(elems, n - 1))
          .map(parentElems => outcomesByName[parentElems.join("")])

      outcome.parents = parentOutcomes
      parentOutcomes.forEach(parent => parent.children.push(outcome))
    }
  }
}

export default {
  components: {
    'vue-mathjax': VueMathjax
  },
  name: 'app',
  data() {
    return {
      funding: null,
      conditions,
      outcomes,
    };
  },
  props: {
    mpf: null
  },
}
</script>

<style>
text {
  font-size: 8px;
}

.node circle {
  stroke: black;
  fill: none;
}

.edgePath path.path {
  stroke: black;
  fill: none;
}

.condition {
  display: inline-block;
}

.outcomes {
  display: table;
}

.outcome-rank {
  display: table-cell;
}
</style>