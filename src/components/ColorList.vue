<script setup lang='ts'>
import { ref } from 'vue'
interface ColorItem {
    label: string,
    value: string
}
const colors = ref<ColorItem[]>([
    {label: 'H2', value: '#ffffff'},
    {label: 'H7', value: '#000000'},
    {label: 'F14', value: '#ffa9ad'},
    {label: 'G14', value: '#8d614c'},
    {label: 'H19', value: '#F6EFE2'},
    {label: 'M9', value: '#a58767'},
    {label: 'F14', value: '#e3d2bc'},
    {label: 'F14', value: '#FCEED7'},

    // // '#FEBFB7',
])
const val = ref<string>('')

const addColor = (color: string) => {
    colors.value.push({
        label: color,
        value: color
    })
}

const emit = defineEmits<{
    (e: 'change-color', color: string): void
}>()

const clickHandler = (c: string) => {
    emit('change-color', c)
}

</script>
<template>
    <div class="list">
        <template v-for="color in colors" :key="color.value">
            <div class="color-item"  :style="{ backgroundColor: color.value }" @click="clickHandler(color.value)">
                <p class="color-text">{{ color.label }} {{ color.value }}</p>
                <button class="del" @click.stop="colors.splice(colors.indexOf(color), 1)">删除</button>
            </div>
        </template>
        <div class="push">
            <input type="text" v-model="val" placeholder="请输入颜色值" />
            <button @click="addColor(val)">添加</button>
        </div>
    </div>
</template>

<style lang='scss' scoped>
    .color-item{
        display: flex;
        justify-content: space-between;
        align-items: center;
        border: 1px solid #999;
        cursor: pointer;
        position: relative;
        margin-bottom: 8px;
        .color-text{
            flex: 1;
            text-align: center;
        }
        .del{
            position: absolute;
            right: 4px;
            top: 50%;
            transform: translateY(-50%);
            display: none;
        }
        &:hover{
            .del{
                display: block;
            }
        }
    }
</style>