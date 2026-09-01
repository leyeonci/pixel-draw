<script setup lang='ts'>
import { ref, onMounted } from 'vue'
import PointCanvas from '@/components/PointCanvas.vue'
import ColorList from '@/components/ColorList.vue'

const color = ref('#000')

</script>

<template>
  <div class="home">
    <PointCanvas :color="color" />
    <ColorList @change-color="color = $event" />
  </div>
</template>

<style lang='scss' scoped>
.home{
    display: flex;
    gap: 24px;
}
</style>