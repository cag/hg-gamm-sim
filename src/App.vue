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

    <div>Holdings:</div>
    <section class="outcomes">
      <div class="outcome-rank" v-for="(outcomeRank, index) in outcomes" :key="`outcomeRank${index}`">
        <ul>
          <li v-for="outcome in outcomeRank" :key="outcome.name">
            <p>{{ outcome.name }}: {{ formatQuantity(outcome.amountHeld) }}</p>
            <ul>
              <li v-for="(quantity, index) in computeQuantity(outcome)" :key="`quantity${index}`">
                {{ quantity }}
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </section>
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

const numAtomicOutcomes = conditions.reduce((acc, outcomes) => acc * outcomes.length, 1)

const outcomes = [
  [{name: '$', amountHeld: 0, lastRecordedOdds: 1, lastParentsRecordedOdds: [], defaultOdds: 1, multiplicity: numAtomicOutcomes, arrowsOut: [], arrowsIn: []}],
]

const outcomeNames = []
const outcomesByName = {}
outcomesByName['$'] = outcomes[0][0]

for (let n = 1; n <= conditions.length; n++) {
  const conditionOutcomes = []
  outcomes.push(conditionOutcomes)
  for(const conditionTuple of combinations(conditions, n)) {
    const defaultOdds = 1 / conditionTuple.reduce((acc, outcomes) => acc * outcomes.length, 1)
    const multiplicity = defaultOdds * numAtomicOutcomes
    for(const elems of product(conditionTuple)) {
      const outcomeName = elems.join("")
      const outcome = {name: outcomeName, amountHeld: 0, lastRecordedOdds: defaultOdds, defaultOdds, multiplicity, arrowsOut: []}
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
      outcome.lastParentsRecordedOdds = outcome.arrowsIn.map(arrow => [arrow.parent.name, arrow.parent.defaultOdds])
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
    outcomeOddsByName() {
      const ret = {}

      const b = Number(this.b)
      if(b === 0 || !Number.isFinite(b))
        return ret

      for(const elems of product(conditions)) {
        const outcomeName = elems.join('')

        let amountHeld = outcomesByName['$'].amountHeld
        for(let n = 1; n <= outcomeName.length; n++) {
          for(const elems of combinations(outcomeName, n)) {
            const outcome = outcomesByName[elems.join('')]
            amountHeld += outcome.amountHeld
          }
        }
        ret[outcomeName] = Math.exp(-amountHeld / b)
      }

      for(let i = outcomes.length - 2; i >= 0; i--) {
        const outcomeRank = outcomes[i]
        for(const outcome of outcomeRank) {
          ret[outcome.name] = outcome.arrowsOut

          const atomicSlotsDescriptor = []
          for(let j = 0; j < conditions.length; j++) {
            let found = false
            for(const elem of outcome.name) {
              const k = conditionIndicesByOutcome[elem]
              if(j === k) {
                atomicSlotsDescriptor.push([elem])
                found = true
                break
              }
            }
            if(!found)
              atomicSlotsDescriptor.push(conditions[j])
          }

          ret[outcome.name] = 0
          for(const elems of product(atomicSlotsDescriptor)) {
            ret[outcome.name] += ret[elems.join('')]
          }
        }
      }

      return ret
    },
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

      return b * Math.log1p(this.outcomeOddsByName[tradeOutcomeName] * (Math.exp(tradeAmount / b) - 1))
    },
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
          outcome.lastRecordedOdds = outcome.defaultOdds
          outcome.lastParentsRecordedOdds = outcome.arrowsIn.map(arrow => [arrow.parent.name, arrow.parent.defaultOdds])
        }
      }
      outcomes[0][0].amountHeld = fundingInput
      this.b = fundingInput / Math.log(numAtomicOutcomes)
    },

    executeTrade() {
      const { tradeOutcomeName } = this
      if(!outcomesByName.hasOwnProperty(tradeOutcomeName) || tradeOutcomeName === '$')
        throw new Error(`${tradeOutcomeName} is not an outcome`)
      const tradeOutcome = outcomesByName[tradeOutcomeName]

      const tradeAmount = Number(this.tradeAmount)
      if(tradeAmount === 0 || !Number.isFinite(tradeAmount))
        throw new Error(`${tradeAmount} is not a valid trade amount`)

      const { tradeCostNaive, b } = this
      // const tradeOutcomeOddsBefore = this.outcomeOddsByName[tradeOutcomeName]

      const tradeConditionIndices = tradeOutcomeName === '$' ? [] : Array.from(tradeOutcomeName).map(elem => conditionIndicesByOutcome[elem])
      if(tradeCostNaive > 0 && tradeAmount > 0) {
        outcomesByName['$'].amountHeld += tradeCostNaive
        tradeOutcome.amountHeld -= tradeAmount
        for(let n = tradeOutcomeName.length - 1; tradeOutcome.amountHeld < 0 && n >= 0; n--) {
          for(const elems of combinations(tradeOutcomeName, n)) {
            const ancestor = outcomesByName[elems.join('') || '$']
            const splitAmount = Math.min(ancestor.amountHeld, -tradeOutcome.amountHeld)
            if(splitAmount > 0) {
              const ancestorConditionIndices = elems.map(elem => conditionIndicesByOutcome[elem])
              let parent = ancestor
              let conditionIndicesLeft = tradeConditionIndices.map((i, j) => [i, tradeOutcomeName[j]]).filter(([i]) => !ancestorConditionIndices.includes(i))

              for(const [nextIndex, newSlot] of conditionIndicesLeft) {
                parent.amountHeld -= splitAmount
                // console.log('lowering', parent.name, 'by', splitAmount)
                const splitTargets = parent.arrowsOut.filter(a => a.conditionIndex === nextIndex).map(a => a.child)

                let newParent = null
                splitTargets.forEach(target => {
                  if(target.name.indexOf(newSlot) >= 0) {
                    if(newParent != null)
                      throw new Error(`double find new parent in splitting loop ${newParent.name} and ${target.name}`)
                    newParent = target
                  }

                  target.amountHeld += splitAmount
                  // console.log('raising', target.name , 'by', splitAmount)
                })

                if(!newParent)
                  throw new Error(`could not find new parent from ${parent.name} going towards ${tradeOutcomeName}`)

                parent = newParent
              }
            }

            if(tradeOutcome.amountHeld >= 0)
              break
          }
        }
      } else if(tradeCostNaive < 0 && tradeAmount < 0) {
        tradeOutcome.amountHeld -= tradeAmount
        outcomesByName['$'].amountHeld += tradeCostNaive
      } else {
        throw new Error(`got mismatching cost ${tradeCostNaive} from trying to trade ${tradeAmount} ${tradeOutcomeName}`)
      }

      // normalize
      const tradeConditions = tradeConditionIndices.map(i => conditions[i])
      for(let n = 1; n <= tradeConditions.length; n++) {
        for(const conditionTuple of combinations(tradeConditions, n)) {
          for(const elems of product(conditionTuple)) {
            const outcome = outcomesByName[elems.join('')]
            outcome.lastParentsRecordedOdds.forEach(info => {
              const [parentName, parentLastOdds] = info
              const parentOutcome = outcomesByName[parentName]
              // console.log('normalizing', parentName, 'from', outcome.lastRecordedOdds, 'to', outcome.lastRecordedOdds * parentOutcome.lastRecordedOdds / parentLastOdds)
              outcome.lastRecordedOdds = outcome.lastRecordedOdds * parentOutcome.lastRecordedOdds / parentLastOdds
              info[1] = parentOutcome.lastRecordedOdds
            })
          }
        }
      }

      const scaledOddsDelta = tradeOutcome.lastRecordedOdds * (Math.exp(tradeAmount / b) - 1)
      // console.log('scaled odds delta', scaledOddsDelta)
      // augment
      for(let n = 1; n <= tradeConditions.length; n++) {
        for(const conditionTuple of combinations(tradeConditions, n)) {
          for(const elems of product(conditionTuple)) {
            const outcome = outcomesByName[elems.join('')]
            if(elems.every(elem => tradeOutcomeName.indexOf(elem) >= 0)) {
              // console.log('augmenting', outcome.name, 'from', outcome.lastRecordedOdds, 'to', (outcome.lastRecordedOdds + scaledOddsDelta) / (1 + scaledOddsDelta))
              outcome.lastRecordedOdds = (outcome.lastRecordedOdds + scaledOddsDelta) / (1 + scaledOddsDelta)
            } else {
              // console.log('augmenting', outcome.name, 'from', outcome.lastRecordedOdds, 'to', outcome.lastRecordedOdds / (1 + scaledOddsDelta))
              outcome.lastRecordedOdds = outcome.lastRecordedOdds / (1 + scaledOddsDelta)
            }
            outcome.lastParentsRecordedOdds.forEach(info => {
              const parentOutcome = outcomesByName[info[0]]
              info[1] = parentOutcome.lastRecordedOdds
            })
          }
        }
      }

      // const tradeOutcomeOddsAfter = this.outcomeOddsByName[tradeOutcomeName]

      // const tradeAncestors = [outcomesByName['$'], ...(tradeOutcomeName === '$' ? [] : [...Array(tradeOutcomeName.length).keys()].map(i => Array.from(combinations(tradeOutcomeName, i + 1))).flat().map(elems => outcomesByName[elems.join('')]))]

      // const normalizeLastRecordedOdds = (outcome) => {
      //   outcome.lastParentsRecordedOdds.forEach(([parentName, parentLastOdds], i) => {
      //     const parentOutcome = outcomesByName[parentName]
      //     normalizeLastRecordedOdds(parentOutcome)
      //     outcome.lastRecordedOdds = outcome.lastRecordedOdds * parentOutcome.lastRecordedOdds / parentLastOdds
      //     outcome.lastParentsRecordedOdds[i][1] = parentOutcome.lastRecordedOdds
      //   })
      // }

      // normalizeLastRecordedOdds(tradeOutcome)
      // const scaledOddsDelta = tradeOutcome.lastRecordedOdds * (Math.exp(tradeAmount / b) - 1)

      // const augmentLastRecordedOdds = (outcome) => {
      //   outcome.lastRecordedOdds = (outcome.lastRecordedOdds + scaledOddsDelta) / (1 + scaledOddsDelta)
      //   outcome.lastParentsRecordedOdds.forEach(([parentName, parentLastOdds], i) => {
      //     const parentOutcome = outcomesByName[parentName]

      //     if(parentOutcome.lastRecordedOdds !== parentLastOdds)
      //       throw new Error(`${parentName} not normalized (${parentOutcome.lastRecordedOdds} !== ${parentLastOdds})`)

      //     augmentLastRecordedOdds(parentOutcome)
      //     outcome.lastParentsRecordedOdds[i][1] = parentOutcome.lastRecordedOdds
      //   })
      // }

      // augmentLastRecordedOdds(tradeOutcome)

      // // outcomesByName['$'].lastRecordedOdds = (1 + outcomesByName['$'].lastRecordedOdds) * (Math.exp(-tradeCostNaive / b)) - 1
      // const mysteryDelta = tradeOutcomeOddsBefore * (Math.exp((tradeAmount - tradeCostNaive) / b) - 1)
      // console.log(mysteryDelta, 'vs', tradeOutcomeOddsAfter - tradeOutcomeOddsBefore)
      // const mysteryDelta = tradeOutcome.lastRecordedOdds * (Math.exp(tradeAmount / b) - 1)

      // outcomesByName['$'].lastRecordedOdds += mysteryDelta
      // const canonicalPathOdds = [1]
      // for(let n = 1; n <= tradeOutcomeName.length; n++) {
      //   const outcome = outcomesByName[tradeOutcomeName.slice(0, n)]
      //   canonicalPathOdds.push(canonicalPathOdds[n - 1] * outcome.lastRecordedOdds)
      // }
      // console.log('got canonical path odds', canonicalPathOdds)

      // const mysteryDelta = canonicalPathOdds[tradeOutcomeName.length] * (Math.exp(tradeAmount / b) - 1)
      // const canonicalPathAugmentedOdds = canonicalPathOdds.map(o => o + mysteryDelta)
      // console.log('delta', mysteryDelta)
      // console.log('canonicalPathAugmentedOdds', mysteryDelta)

      // for(let n = 1; n <= tradeOutcomeName.length; n++) {
      //   const conditionIndex = conditionIndicesByOutcome[tradeOutcomeName[n - 1]]
      //   for(const elem of conditions[conditionIndex]) {
      //     const outcome = outcomesByName[tradeOutcomeName.slice(0, n - 1) + elem]
      //     // const oldMystery = outcome.lastRecordedOdds
      //     outcome.lastRecordedOdds = (elem === tradeOutcomeName[n - 1] ? canonicalPathAugmentedOdds[n] : canonicalPathOdds[n - 1] * outcome.lastRecordedOdds) / canonicalPathAugmentedOdds[n - 1]

      //     // console.log(outcome.name, ':', oldMystery, '->', outcome.lastRecordedOdds)
      //   }
      // }

      // for(const ta of tradeAncestors)
      //   ta.lastRecordedOdds += mysteryDelta
    },

    formatQuantity(q) {
      if(Number.isFinite(q))
        return q.toFixed(4).replace(/\.?0*$/, '')
      return null
    },

    computeQuantity(outcome) {
      // const { b } = this
      // const ancestors = [outcomesByName['$'], ...(outcome.name === '$' ? [] : [...Array(outcome.name.length).keys()].map(i => Array.from(combinations(outcome.name, i + 1))).flat().map(elems => outcomesByName[elems.join('')]))]

      // const recursiveThingName = (o) => {
      //   if(o.name.length < 2)
      //     return `P(${o.name})`

      //   return `P(${o.name})/(${o.arrowsIn.map(a => `(${recursiveThingName(a.parent)})`).join('*')})`
      // }

      // const recursiveThing = (o) => {
      //   if(o.name.length < 2)
      //     return this.outcomeOddsByName[o.name]

      //   return this.outcomeOddsByName[o.name] / o.arrowsIn.reduce((acc, arrow) => acc * recursiveThing(arrow.parent), 1)
      // }

      return [].concat(
        [`LRP(${outcome.name}) = ${this.formatQuantity(outcome.lastRecordedOdds)}`],
        outcome.lastParentsRecordedOdds.map(([name, odds]) => `LRP(${name}) = ${this.formatQuantity(odds)}`),
        // [`?/?[$] = ${this.formatQuantity(outcome.lastRecordedOdds / outcomesByName['$'].lastRecordedOdds)}`],
        // outcome.name === '$' ? [] : [`prod(? for canonical path) = ${this.formatQuantity(Array.from(outcome.name).reduce(([parentName, q], newElem) => [parentName + newElem, q * outcomesByName[parentName + newElem].lastRecordedOdds], ['', outcomesByName['$'].lastRecordedOdds])[1])}`],
        // [`exp(-sum(holdings for all ancestors)/b) * multiplicity = ${Math.exp(-ancestors.reduce((acc, anc) => acc + anc.amountHeld, 0) / b) * outcome.multiplicity}`],
        // [`prod(1 + ? for all ancestors) = ${ancestors.reduce((acc, anc) => acc * (1 + anc.lastRecordedOdds), 1)}`],
        // [`prod(exp(-holdings/b for all ancestors) = ${ancestors.reduce((acc, anc) => acc * Math.exp(-anc.amountHeld / b), 1)}`],
        // outcome.name.length < 2 ? [] : [`${Array.from(outcome.name).map(elem => `P(${elem})`).join('*')} = ${
        //   this.formatQuantity(Array.from(outcome.name).map(elem => this.outcomeOddsByName[elem]).reduce((a, b) => a * b, 1))
        // }`],
        [`P(${outcome.name}) = ${this.formatQuantity(this.outcomeOddsByName[outcome.name])}`],
        // outcome.name.length < 2 ? [] : [`P(${outcome.name.slice(-1)}|${outcome.name.slice(0, -1)}) = ${this.formatQuantity(this.outcomeOddsByName[outcome.name] / this.outcomeOddsByName[outcome.name.slice(0, -1)])}`],
        // [`P(${outcome.name})/${Array.from(outcome.name).map(elem => `P(${elem})`).join('*')} = ${this.formatQuantity(this.outcomeOddsByName[outcome.name] / Array.from(outcome.name).map(elem => this.outcomeOddsByName[elem]).reduce((a, b) => a * b, 1))}`],
        // [`${[...Array(outcome.name.length).keys()].map(i => Array.from(combinations(outcome.name, i + 1)).map(elems => `P(${elems.join('')})`).join('*')).reduce((acc, num) => `${num}/(${acc})`)} = ${this.formatQuantity([...Array(outcome.name.length).keys()].map(i => Array.from(combinations(outcome.name, i + 1)).map(elems => this.outcomeOddsByName[elems.join('')]).reduce((a, b) => a * b, 1)).reduce((acc, num) => num / acc))}`],
        // outcome.name.length < 2 ? [] : [`${recursiveThingName(outcome)} = ${this.formatQuantity(recursiveThing(outcome))}`],
        // outcome.name.length < 2 ? [] : [`P(${outcome.name})/(${outcome.arrowsIn.map(a => `P(${a.parent.name})`).join('*')})^(1/${outcome.name.length - 1}) = ${this.formatQuantity(this.outcomeOddsByName[outcome.name] / Math.pow(outcome.arrowsIn.reduce((acc, arrow) => acc * this.outcomeOddsByName[arrow.parent.name], 1), 1 / (outcome.name.length - 1)))}`],
        // outcome.name.length < 2 ? [] : [`P(${outcome.name})/(${outcome.arrowsIn.map(a => `P(${a.parent.name})`).join('+')}) = ${this.formatQuantity(this.outcomeOddsByName[outcome.name] / outcome.arrowsIn.reduce((acc, arrow) => acc + this.outcomeOddsByName[arrow.parent.name], 0))}`],
        // outcome.name.length < 2 ? [] : [`P(${outcome.name})^${outcome.name.length - 1}/(${outcome.arrowsIn.map(a => `P(${a.parent.name})`).join('*')}) = ${this.formatQuantity(Math.pow(this.outcomeOddsByName[outcome.name], outcome.name.length - 1) / outcome.arrowsIn.reduce((acc, arrow) => acc * this.outcomeOddsByName[arrow.parent.name], 1))}`],
        // [`P(${outcome.name})*(${[...Array(outcome.name.length).keys()].map(i => Array.from(combinations(outcome.name, i + 1)).map(elems => `P(${elems.join('')})`).join('+')).reduce((acc, sum, i) => `${acc}${i&1?'+':'-'}(${sum})`, '1')})/(${outcome.arrowsIn.map(a => `P(${a.parent.name})`).join('*')}) = ${this.formatQuantity(this.outcomeOddsByName[outcome.name] * ([...Array(outcome.name.length).keys()].map(i => Array.from(combinations(outcome.name, i + 1)).map(elems => this.outcomeOddsByName[elems.join('')]).reduce((a, b) => a + b, 0)).reduce((acc, sum, i) => i&1?acc+sum:acc-sum, 1)) / outcome.arrowsIn.reduce((acc, arrow) => acc * this.outcomeOddsByName[arrow.parent.name], 1))}`],
        // outcome.name.length < 2 ? [] : [`P(${outcome.name})^${outcome.arrowsIn.length}/(${outcome.arrowsIn.map(a => `P(${a.parent.name})`).join('*')}) = ${this.formatQuantity(Math.pow(this.outcomeOddsByName[outcome.name], outcome.arrowsIn.length) / outcome.arrowsIn.reduce((acc, arrow) => acc * this.outcomeOddsByName[arrow.parent.name], 1))}`],
        // outcome.name.length < 2 ? [] : [`P(${outcome.name}) - ${Array.from(outcome.name).map(elem => `P(${elem})`).join('*')} = ${
        //   this.formatQuantity(this.outcomeOddsByName[outcome.name] - Array.from(outcome.name).map(elem => this.outcomeOddsByName[elem]).reduce((a, b) => a * b, 1))
        // }`],
        // outcome.name.length < 2 ? [] : [`P(${outcome.name.slice(-1)}|${outcome.name.slice(0, -1)}) = ${
        //   this.formatQuantity(this.outcomeOddsByName[outcome.name] / this.outcomeOddsByName[outcome.name.slice(0, -1)])
        // }`]
        // outcome.arrowsIn.map(a => `P(${a.parent.name} -> ${outcome.name}) = ${
        //   this.formatQuantity(1 - this.outcomeOddsByName[a.parent.name] + this.outcomeOddsByName[outcome.name])
        // }`),
        // outcome.arrowsIn.map(a => {
        //   const parentElems = Array.from(a.parent.name)
        //   const extElems = Array.from(outcome.name).filter(e => !parentElems.includes(e))
        //   const extOutcome = outcomesByName[extElems.join('')]
        //   return `P(${extOutcome.name}|${a.parent.name}) = ${this.formatQuantity(this.outcomeOddsByName[outcome.name] / this.outcomeOddsByName[a.parent.name])}`
        // }),
        // outcome.arrowsIn.map(a => {
        //   const parentElems = Array.from(a.parent.name)
        //   const extElems = Array.from(outcome.name).filter(e => !parentElems.includes(e))
        //   const extOutcome = outcomesByName[extElems.join('')]
        //   return `P(${a.parent.name}|${extOutcome.name}) - P(${outcome.name}) = ${this.formatQuantity(this.outcomeOddsByName[outcome.name] / this.outcomeOddsByName[extOutcome.name] - this.outcomeOddsByName[outcome.name])}`
        // }),
      )
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
