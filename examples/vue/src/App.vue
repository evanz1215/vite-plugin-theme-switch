<script setup lang="ts">
// always import @brand, no need to know which brand is active
import Banner from "@brand-components/Banner.vue";
import Footer from "@brand-components/Footer.vue";

const mode = DEV ? "development" : "production";
</script>

<template>
  <main>
    <Banner />
    <p>Framework: Vue</p>
    <p>Vite mode: {{ mode }}</p>
    <Footer />
  </main>
</template>
