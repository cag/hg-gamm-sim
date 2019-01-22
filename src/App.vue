<template>
  <div>
    <div>Condition outcomes:</div>
    <section class="conditions">
      <div class="condition" v-for="(condition, index) in conditions" :key="`outcomeRank${index}`">
        <ul>
          <li v-for="slot in condition" :key="slot">
            {{ slot }}
          </li>
        </ul>
      </div>
    </section>

    <form @submit.prevent="reset">
      <label>Initial funding: <input v-model.number="fundingInput"></label><button type="submit">Reset</button>
    </form>

    <p><em>b</em> = {{ b }}</p>

    <div>Holdings:</div>
    <section class="outcomes">
      <div class="outcome-rank" v-for="(outcomeRank, index) in outcomes" :key="`outcomeRank${index}`">
        <ul>
          <li v-for="outcome in outcomeRank" :key="outcome.name">
            {{ outcome.name }}: {{ outcome.amountHeld }} :: {{ outcome.mysteryQuantity }}
          </li>
        </ul>
      </div>
    </section>

    <form @submit.prevent="executeTrade">
      <div><label>Outcome: <select v-model="tradeOutcomeName">
        <option v-for="outcomeName in outcomeNames" :key="outcomeName">{{ outcomeName }}</option>
      </select></label></div>
      <div>
        <label>Amount: <input v-model.number="tradeAmount"></label>
      </div>
      <div>Trade cost (naive): {{ tradeCostNaive }}</div>
      <button type="submit">Execute trade</button>
    </form>
  </div>
</template>

<script>

import {combinations} from '@aureooms/js-itertools/src/map/combinations.js'
import {product} from '@aureooms/js-itertools/src/map/product.js'

const conditions = [
  ['A', 'B', 'C'],
  ['X', 'Y', 'Z'],
  ['i', 'j', 'k'],
]

const conditionIndicesByOutcome = {}
conditions.forEach((outcomes, i) => outcomes.forEach(outcome => conditionIndicesByOutcome[outcome] = i))

const outcomes = [
  [{name: '$', amountHeld: 0, mysteryQuantity: 0, defaultOdds: 1, arrowsOut: [], arrowsIn: []}],
]

const numAtomicOutcomes = conditions.reduce((acc, outcomes) => acc * outcomes.length, 1)

const outcomeNames = []
const outcomesByName = {}
outcomesByName['$'] = outcomes[0][0]

for (let n = 1; n <= conditions.length; n++) {
  const conditionOutcomes = []
  outcomes.push(conditionOutcomes)
  for(const conditionTuple of combinations(conditions, n)) {
    const defaultOdds = 1 / conditionTuple.reduce((acc, outcomes) => acc * outcomes.length, 1)
    for(const elems of product(conditionTuple)) {
      const outcomeName = elems.join("")
      const outcome = {name: outcomeName, amountHeld: 0, mysteryQuantity: 0, defaultOdds, arrowsOut: []}
      conditionOutcomes.push(outcome)
      outcomeNames.push(outcomeName)
      outcomesByName[outcomeName] = outcome

      const arrows = n === 1 ? [{
        parent: outcomesByName['$'],
        child: outcome,
        conditionIndex: conditionIndicesByOutcome[outcomeName],
      }] :
        Array.from(outcomeName)
          .map((slot, i) => ({
            parent: outcomesByName[outcomeName.slice(0, i) + outcomeName.slice(i + 1)],
            child: outcome,
            conditionIndex: conditionIndicesByOutcome[outcomeName[i]],
          }))

      outcome.arrowsIn = arrows
      arrows.forEach(desc => desc.parent.arrowsOut.push(desc))
    }
  }
}

const defaultFunding = 100

export default {
  name: 'app',
  data() {
    return {
      fundingInput: defaultFunding,
      b: null,
      tradeOutcomeName: null,
      tradeAmount: null,
      conditions,
      outcomes,
      outcomeNames,
    };
  },
  computed: {
    tradeCostNaive() {
      const { tradeOutcomeName } = this
      if(!outcomesByName.hasOwnProperty(tradeOutcomeName) || tradeOutcomeName === '$')
        return null

      const tradeAmount = Number(this.tradeAmount)
      if(tradeAmount === 0 || !Number.isFinite(tradeAmount))
        return null

      const b = Number(this.b)
      if(b === 0 || !Number.isFinite(b))
        return null

      const atomicSlotsDescriptor = []
      for(let i = 0; i < conditions.length; i++) {
        let found = false
        for(const elem of tradeOutcomeName) {
          const j = conditionIndicesByOutcome[elem]
          if(i === j) {
            atomicSlotsDescriptor.push([elem])
            found = true
            break
          }
        }
        if(!found)
          atomicSlotsDescriptor.push(conditions[i])
      }

      let expSum = 0
      for(const elems of product(atomicSlotsDescriptor)) {
        const outcomeName = elems.join('')
        console.log(outcomeName)
        let amountHeld = outcomesByName['$'].amountHeld
        for(let n = 1; n <= outcomeName.length; n++) {
          for(const elems of combinations(outcomeName, n)) {
            const outcome = outcomesByName[elems.join('')]
            amountHeld += outcome.amountHeld
          }
        }
        expSum += Math.exp(-amountHeld / b)
      }

      return b * Math.log(1 + expSum * (Math.exp(tradeAmount / b) - 1))
    }
  },
  props: {
    mpf: null,
  },
  methods: {
    reset() {
      let fundingInput = Number(this.fundingInput)
      if(fundingInput <= 0 || !Number.isFinite(fundingInput))
        this.fundingInput = fundingInput = defaultFunding

      const { outcomes } = this
      for(const outcomeRank of outcomes) {
        for(const outcome of outcomeRank) {
          outcome.amountHeld = 0
        }
      }
      outcomes[0][0].amountHeld = fundingInput
      this.b = fundingInput / Math.log(numAtomicOutcomes)
    },

    executeTrade() {
      const { tradeOutcomeName } = this
      if(!outcomesByName.hasOwnProperty(tradeOutcomeName) || tradeOutcomeName === '$')
        throw new Error(`${tradeOutcomeName} is not an outcome`)

      const tradeAmount = Number(this.tradeAmount)
      if(tradeAmount === 0 || !Number.isFinite(tradeAmount))
        throw new Error(`${tradeAmount} is not a valid trade amount`)

      const { tradeCostNaive } = this

      outcomesByName['$'].amountHeld += tradeCostNaive
      outcomesByName[tradeOutcomeName].amountHeld -= tradeAmount
    },
  },
  mounted() {
    this.reset()
  },
}
</script>

<style>
.conditions {
  display: table;
}

.condition {
  display: table-cell;
}

.outcomes {
  display: table;
}

.outcome-rank {
  display: table-cell;
}
</style>
