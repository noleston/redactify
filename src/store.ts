import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RedactionMarker {
  id: string; // Monaco decoration ID
  replacementType: 'blackout' | 'redacted' | 'empty' | 'custom';
  customText?: string;
  replacement: string;
}

interface RedactionStore {
  markers: RedactionMarker[];
  fixedLength: boolean;
  strictMasking: boolean;
  smartWordSnap: boolean;
  setFixedLength: (val: boolean) => void;
  setStrictMasking: (val: boolean) => void;
  setSmartWordSnap: (val: boolean) => void;
  addMarkers: (markers: RedactionMarker[]) => void;
  removeMarker: (id: string) => void;
  removeMarkers: (ids: string[]) => void;
  clearMarkers: () => void;
}

export const useRedactionStore = create<RedactionStore>()(
  persist(
    (set) => ({
      markers: [],
      fixedLength: false,
      strictMasking: false,
      smartWordSnap: false,
      setFixedLength: (fixedLength) => set({ fixedLength }),
      setStrictMasking: (strictMasking) => set({ strictMasking }),
      setSmartWordSnap: (smartWordSnap) => set({ smartWordSnap }),
      addMarkers: (newMarkers) => set((state) => ({ markers: [...state.markers, ...newMarkers] })),
      removeMarker: (id) => set((state) => ({ markers: state.markers.filter((m) => m.id !== id) })),
      removeMarkers: (ids) => set((state) => ({ markers: state.markers.filter((m) => !ids.includes(m.id)) })),
      clearMarkers: () => set({ markers: [] }),
    }),
    {
      name: 'redactify-settings',
      partialize: (state) => ({
        fixedLength: state.fixedLength,
        strictMasking: state.strictMasking,
        smartWordSnap: state.smartWordSnap,
      }),
    }
  )
);
