<script setup lang="ts">
import {computed} from 'vue'
const model = defineModel<any>()

const body = computed(()=>atob(model.value?.responseBody ?? ''))
</script>

<template>
  <div style="padding: 20px">
    <pre>{{ body }}</pre>
  </div>
</template>

<style scoped>

</style>
