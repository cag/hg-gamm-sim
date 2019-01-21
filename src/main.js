// import "babel-core/register"
import "babel-polyfill"

import Vue from 'vue'
import App from './App.vue'

Vue.config.productionTip = false

// eslint-disable-next-line no-undef
new Vue({
  render: h => h(App),
}).$mount('#app')
