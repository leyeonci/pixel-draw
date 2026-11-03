import { openDB } from 'idb'
import { ref } from 'vue'

export function useIdb () {
    const db = ref()
    const initialize = (dbName: string) => {
        db.value = openDB(dbName, 1, {
            upgrade (db) {
                // Create a store of objects. We'll use 'id' as the key path.
                const stroe = db.createObjectStore('artworks', { keyPath: 'id', autoIncrement: true })
                stroe.createIndex('createdAt', 'createdAt')
            }
        })
    }
}