<script setup lang='ts'>
import { ref, onMounted, watch } from 'vue'
import { usePixelCanvas } from '@/composable/usePixelCanvas';
const props = defineProps<{
    color: string
}>()

const {
    canvasRef,
    ctx,
    drawing,
    initCanvas,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    exportCanvas,
    changePenColor,
    loadData,
    exportData
} = usePixelCanvas({
        width: 800,
        height: 800,
        pixelPointX: 50,
        pixelPointY: 50,
        margin: 24,
        background: '#fff'
    })

watch(() => props.color, (newColor) => {
    changePenColor(newColor)
})

onMounted(() => {
    initCanvas()
})

const exportHandler = () => {
    const dataUrl = exportCanvas()

    const link = document.createElement('a')
    link.download = 'canvas.png'
    link.href = dataUrl
    link.target = '_blank'

    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

const exportDataHandler = () => {
    const pixelData = exportData()
    localStorage.setItem('pixelData', JSON.stringify(pixelData))

    // 内容存储到json文件中
    const blob = new Blob([JSON.stringify(pixelData)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'pixelData.json'
    link.click()
    URL.revokeObjectURL(url)
}

const loadDataHandler = () => {
    const pixelData = localStorage.getItem('pixelData')
    if (pixelData) {
        loadData(JSON.parse(pixelData))
    }
}
</script>

<template>
    <div class="box">
        <div class="block">
            <!-- @click="clickHandler"  -->
            <canvas ref="canvasRef" class="canvas" 
                @mousedown="onMouseDown" 
                @mousemove="onMouseMove"
                @mouseup="onMouseUp" />
        </div>
        <button @click="exportHandler">导出png</button>
        <button @click="exportDataHandler">存储json</button>
        <button @click="loadDataHandler">读取json</button>

    </div>
</template>

<style lang='scss' scoped>
.block {
    width:fit-content;
    height: fit-content;
    // width: 824px;
    // height: 824px;
    overflow: hidden;
    box-sizing: border-box;

    .canvas {
        width: 100%;
        height: 100%;
    }
}
</style>