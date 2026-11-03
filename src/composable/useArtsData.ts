import { ref } from 'vue';

interface Art {
    id: number;
    name: string;
    description?: string;
    version: 1
    pixelPointX: number
    pixelPointY: number
    cells: Record<string, string>
    colors: Record<string, string>
}
export function useArtsData() {
    const arts = ref<Art[]>([]);

    function getArts() {
        
    }

    function addArt(art: Art) {
        
    }

    return {
        arts,
        getArts,
        addArt
    }
}