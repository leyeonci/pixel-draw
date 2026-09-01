import { ref, type Ref } from 'vue'
interface GridOptions {
    show?: boolean
    color?: string
    lineWidth?: number
}

interface AxisOptions {
    show?: boolean
    color?: string
    font?: string
}
interface PixelCanvasOptions {
    width: number
    height: number
    pixelPointX?: number
    pixelPointY?: number
    margin?: number
    background?: string
    grid?: GridOptions
    axis?: AxisOptions
}

interface PixelData {
    version: 1
    pixelPointX: number
    pixelPointY: number
    cells: Record<string, string>
}

export function usePixelCanvas(options: PixelCanvasOptions) {
    let {
        width,
        height,
        pixelPointX = 50,
        pixelPointY = 50,
        margin = 30,
        background = '#fff',
        grid = { show: true, color: '#d3d3d3', lineWidth: 1 },
        axis = { show: true, color: '#666', font: '10px Arial' }
    } = options
    const gridShow = grid.show ?? true
    const gridLineWidth = grid.lineWidth ?? 0.5
    const gridColor = grid.color ?? '#d3d3d3'

    const canvasRef = ref<HTMLCanvasElement | null>(null)
    const ctx = ref<CanvasRenderingContext2D | null>(null)
    const drawing = ref(false)
    const cellData = ref<Map<string, string>>(new Map())

    const pixelPointWidth = width / pixelPointX    // 每个像素点宽度
    const pixelPointHeight = height / pixelPointY   // 每个像素点高度

    // 初始化canvas，设置宽高，填充背景，绘制网格
    const initCanvas = () => {
        const canvas = canvasRef.value
        if (!canvas) return
        const _ctx = canvas.getContext('2d')
        if (!_ctx) return
        ctx.value = _ctx

        const dpr = window.devicePixelRatio || 1
        const extraSpace = gridShow ? Math.ceil(gridLineWidth / 2) + 1 : 0
        console.log('extraSpace', extraSpace, 'dpr', dpr);
        
        const displayWidth = width + margin + extraSpace
        const displayHeight = height + margin + extraSpace

        canvas.width = displayWidth * dpr
        canvas.height = displayHeight * dpr

        canvas.style.width = displayWidth + 'px'
        canvas.style.height = displayHeight + 'px'

        ctx.value.scale(dpr, dpr)

        redraw()
    }

    const clearCanvas = () => {
        cellData.value.clear()
        redraw()
    }

    const redraw = () => {
        fillBackground()
        gridShow && drawGrid()
        axis.show && drawAxis()
    }

    // 填充背景
    const fillBackground = () => {
        if (!ctx.value) return
        ctx.value.fillStyle = background
        ctx.value.fillRect(0, 0, width + margin, height + margin)
    }

    // 绘制网格
    const drawGrid = () => {
        if (!ctx.value) return
        ctx.value.strokeStyle = gridColor as string
        ctx.value.lineWidth = gridLineWidth

        ctx.value.save()
        ctx.value.translate(margin, margin)
        ctx.value.beginPath()
        for (let i = 0; i <= pixelPointX; i++) {
            // const x = gridLinePos(i, pixelPointWidth)
            const x = Math.round(i * pixelPointWidth) + 0.5
            ctx.value.moveTo(x, 0)
            ctx.value.lineTo(x, height)
        }
        for (let i = 0; i <= pixelPointY; i++) {
            // const y = gridLinePos(i, pixelPointHeight)
            const y = Math.round(i * pixelPointHeight) + 0.5
            ctx.value.moveTo(0, y)
            ctx.value.lineTo(width, y)
        }
        ctx.value.stroke()
        ctx.value.restore()
    }

    // 绘制坐标轴
    const drawAxis = () => {
        if (!ctx.value) return
        ctx.value.fillStyle = axis.color ?? '#666'
        ctx.value.font = axis.font ?? '10px Arial'
        ctx.value.textBaseline = 'middle'
        ctx.value.textAlign = 'center'

        const step = Math.max(1, Math.ceil(20 / pixelPointWidth))
        for (let i = 0; i < pixelPointX; i += step) {
            ctx.value.fillText(`${i}`, margin + i * pixelPointWidth + pixelPointWidth / 2, margin / 2)
        }
        for (let i = 0; i < pixelPointY; i += step) {
            ctx.value.fillText(`${i}`, margin / 2, margin + i * pixelPointHeight + pixelPointHeight / 2)
        }
    }

    // 坐标转换
    // 把鼠标事件的 offsetX/offsetY（显示坐标）转换成 canvas 内部真实坐标
    const coordinateTransform = ({ x, y }: { x: number, y: number }) => {
        if (!canvasRef.value) return { x: 0, y: 0 }
        const rect = canvasRef.value.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        const scaleX = (canvasRef.value.width / dpr) / rect.width
        const scaleY = (canvasRef.value.height / dpr) / rect.height
        const realX = x * scaleX
        const realY = y * scaleY

        return { x: realX, y: realY }
    }

    // 根据鼠标点击位置，获取对应的像素点坐标
    const getCellFromEvent = (e: MouseEvent) => {
        const { x: realX, y: realY } = coordinateTransform({ x: e.offsetX, y: e.offsetY })
        const offsetX = realX - margin
        const offsetY = realY - margin
        if (offsetX < 0 || offsetY < 0) return null

        const x = Math.floor(offsetX / pixelPointWidth)
        const y = Math.floor(offsetY / pixelPointHeight)
        if (x >= pixelPointX || y >= pixelPointY) return null
        return { x, y }
    }

    // 填充单个像素点
    const fillCell = (x: number, y: number, color?: string) => {
        if (!ctx.value) return
        const fillColor = color ?? ctx.value.fillStyle as string
        ctx.value.fillStyle = fillColor

        const fillWidth = Math.max(0, pixelPointWidth - gridLineWidth)
        const fillHeight = Math.max(0, pixelPointHeight - gridLineWidth)

        ctx.value.fillRect(
            margin + x * pixelPointWidth + gridLineWidth / 2 + 0.5,
            margin + y * pixelPointHeight + gridLineWidth / 2 + 0.5,
            fillWidth,
            fillHeight
        )
        cellData.value.set(`${x}-${y}`, fillColor)
    }

    const onMouseDown = (e: MouseEvent) => {
        const cell = getCellFromEvent(e)
        if (!cell) return
        drawing.value = true
        fillCell(cell.x, cell.y)
    }

    const onMouseMove = (e: MouseEvent) => {
        if (!drawing.value) return
        const cell = getCellFromEvent(e)
        if (!cell) return
        fillCell(cell.x, cell.y)
    }

    const onMouseUp = () => {
        drawing.value = false
    }

    // 改变画笔颜色
    const changePenColor = (color: string) => {
        ctx.value && (ctx.value.fillStyle = color)
    }

    // 导出
    const exportCanvas = () => {
        return canvasRef.value?.toDataURL('image/png') ?? ''
    }

    const exportData = (): PixelData => {
        return {
            version: 1,
            pixelPointX,
            pixelPointY,
            cells: Object.fromEntries(cellData.value)
        }
    }

    const loadData = (data: PixelData) => {
        cellData.value = new Map(Object.entries(data.cells))
        pixelPointX = data.pixelPointX
        pixelPointY = data.pixelPointY
        redraw()
        for (const [key, color] of cellData.value) {
            const [x, y] = key.split('-').map(Number)
            fillCell(x, y, color)
        }
    }

    return {
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
        exportData,
    }
}