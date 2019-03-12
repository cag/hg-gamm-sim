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

let tradeNonce = 0

const outcomes = [
  [{
    name: '$',
    amountHeld: 0,
    lastRecordedOdds: 1,
    lastParentsRecordedOdds: [],
    defaultOdds: 1,
    multiplicity: numAtomicOutcomes,
    lastCostLevelSumComponent: numAtomicOutcomes,
    lastParentsCostLevelSumComponents: [],
    lastTradeNonce: tradeNonce,
    arrowsOut: [],
    arrowsIn: []
  }],
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
      const outcome = {
        name: outcomeName,
        amountHeld: 0,
        lastRecordedOdds: defaultOdds,
        defaultOdds,
        multiplicity,
        lastCostLevelSumComponent: multiplicity,
        arrowsOut: [],
      }
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
      outcome.lastParentsCostLevelSumComponents = outcome.arrowsIn.map(arrow => [arrow.parent.name, arrow.parent.lastCostLevelSumComponent])
      outcome.lastTradeNonce = tradeNonce
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

      tradeNonce++

      const { outcomes } = this
      for(const outcomeRank of outcomes) {
        for(const outcome of outcomeRank) {
          outcome.amountHeld = 0
          outcome.lastRecordedOdds = outcome.defaultOdds
          outcome.lastParentsRecordedOdds = outcome.arrowsIn.map(arrow => [arrow.parent.name, arrow.parent.defaultOdds])
          outcome.lastCostLevelSumComponent = outcome.multiplicity
          outcome.lastParentsCostLevelSumComponents = outcome.arrowsIn.map(arrow => [arrow.parent.name, arrow.parent.multiplicity])
          outcome.lastTradeNonce = tradeNonce
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
                const splitTargets = parent.arrowsOut.filter(a => a.conditionIndex === nextIndex).map(a => a.child)

                let newParent = null
                splitTargets.forEach(target => {
                  if(target.name.indexOf(newSlot) >= 0) {
                    if(newParent != null)
                      throw new Error(`double find new parent in splitting loop ${newParent.name} and ${target.name}`)
                    newParent = target
                  }

                  target.amountHeld += splitAmount
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

      tradeNonce++

      // normalize
      const tradeConditions = tradeConditionIndices.map(i => conditions[i])
      for(let n = 1; n <= tradeConditions.length; n++) {
        for(const conditionTuple of combinations(tradeConditions, n)) {
          for(const elems of product(conditionTuple)) {
            const outcome = outcomesByName[elems.join('')]
            outcome.lastParentsRecordedOdds.forEach(info => {
              const [parentName, parentLastOdds] = info
              const parentOutcome = outcomesByName[parentName]
              outcome.lastRecordedOdds = outcome.lastRecordedOdds * parentOutcome.lastRecordedOdds / parentLastOdds
              info[1] = parentOutcome.lastRecordedOdds
            })

            for(const info of outcome.lastParentsCostLevelSumComponents) {
              const [parentName, parentLastComponent] = info
              const parentOutcome = outcomesByName[parentName]
              if(parentOutcome.lastTradeNonce > outcome.lastTradeNonce) {
                outcome.lastCostLevelSumComponent = outcome.lastCostLevelSumComponent * parentOutcome.lastCostLevelSumComponent / parentLastComponent
                info[1] = parentOutcome.lastCostLevelSumComponent
              }
            }
          }
        }
      }

      const deltaMultiplier = Math.exp(tradeAmount / b) - 1
      const scaledOddsDelta = tradeOutcome.lastRecordedOdds * deltaMultiplier
      const componentDelta = tradeOutcome.lastCostLevelSumComponent * deltaMultiplier

      // augment
      outcomesByName['$'].lastCostLevelSumComponent += componentDelta
      outcomesByName['$'].lastTradeNonce = tradeNonce
      for(let n = 1; n <= tradeConditions.length; n++) {
        for(const conditionTuple of combinations(tradeConditions, n)) {
          for(const elems of product(conditionTuple)) {
            const outcome = outcomesByName[elems.join('')]
            if(elems.every(elem => tradeOutcomeName.indexOf(elem) >= 0)) {
              outcome.lastRecordedOdds = (outcome.lastRecordedOdds + scaledOddsDelta) / (1 + scaledOddsDelta)
              outcome.lastCostLevelSumComponent += componentDelta
            } else {
              outcome.lastRecordedOdds = outcome.lastRecordedOdds / (1 + scaledOddsDelta)
            }
            outcome.lastParentsRecordedOdds.forEach(info => {
              const parentOutcome = outcomesByName[info[0]]
              info[1] = parentOutcome.lastRecordedOdds
            })
            outcome.lastParentsCostLevelSumComponents.forEach(info => {
              const parentOutcome = outcomesByName[info[0]]
              info[1] = parentOutcome.lastCostLevelSumComponent
            })
            outcome.lastTradeNonce = tradeNonce
          }
        }
      }
    },

    formatQuantity(q) {
      if(Number.isFinite(q))
        return q.toFixed(6).replace(/\.?0*$/, '')
      return null
    },

    computeQuantity(outcome) {
      return [].concat(
        [`last trade @ ${outcome.lastTradeNonce}`],
        [`LCLSC(${outcome.name}) = ${this.formatQuantity(outcome.lastCostLevelSumComponent)}`],
        outcome.lastParentsCostLevelSumComponents.map(([name, component]) => `LPCLSC(${name}) = ${this.formatQuantity(component)}`),
        [`est P(${outcome.name}) = ${this.formatQuantity(outcome.lastCostLevelSumComponent / outcomesByName['$'].lastCostLevelSumComponent)}`],
        [`P(${outcome.name}) = ${this.formatQuantity(this.outcomeOddsByName[outcome.name])}`],
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
