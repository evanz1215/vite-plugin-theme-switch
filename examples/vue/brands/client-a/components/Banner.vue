<template>
  <header class="banner">
    <h1>{{ title }}</h1>
  </header>
</template>

<script setup lang="ts">
const title = "Client A";
</script>

<style scoped>
.banner {
  padding: 1rem;
  background: #dc2626;
  color: white;
}
</style>
