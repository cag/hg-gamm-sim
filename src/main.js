// import "babel-core/register"
import "babel-polyfill"

import Vue from 'vue'
import App from './App.vue'

Vue.config.productionTip = false

// eslint-disable-next-line no-undef
fetchMPWasm('mp.wasm').then( ({mpf}) => {
  new Vue({
    data: { mpf },
    render: h => h(App, { props: { mpf }}),
  }).$mount('#app')
})
