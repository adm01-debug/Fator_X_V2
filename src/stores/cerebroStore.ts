/**
 * Nexus Agents Studio — Super Cérebro Store (Zustand)
 * State for Knowledge Graph, notebooks (collections), queries, health.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CerebroState {
  activeTab: string;

  // Search
  searchQuery: string;
  searchResults: Record<string, unknown>[];
  isSearching: boolean;

  // Notebooks (collections)
  collections: Record<string, unknown>[];
  selectedCollectionId: string | null;
  activeNotebookId: string | null;

  // Health
  healthScore: number;
  decayAlerts: number;
  duplicateAlerts: number;

  setActiveTab: (tab: string) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: Record<string, unknown>[]) => void;
  setIsSearching: (searching: boolean) => void;
  setCollections: (collections: Record<string, unknown>[]) => void;
  selectCollection: (id: string | null) => void;
  setActiveNotebook: (id: string | null) => void;
  setHealthScore: (score: number) => void;
  setAlerts: (decay: number, duplicates: number) => void;
  reset: () => void;
}

export const useCerebroStore = create<CerebroState>()(
  persist(
    (set) => ({
      activeTab: 'overview',
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      collections: [],
      selectedCollectionId: null,
      activeNotebookId: null,
      healthScore: 0,
      decayAlerts: 0,
      duplicateAlerts: 0,

      setActiveTab: (tab) => set({ activeTab: tab }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSearchResults: (results) => set({ searchResults: results }),
      setIsSearching: (searching) => set({ isSearching: searching }),
      setCollections: (collections) => set({ collections }),
      selectCollection: (id) => set({ selectedCollectionId: id }),
      setActiveNotebook: (id) => set({ activeNotebookId: id }),
      setHealthScore: (score) => set({ healthScore: score }),
      setAlerts: (decay, duplicates) => set({ decayAlerts: decay, duplicateAlerts: duplicates }),
      reset: () =>
        set({
          activeTab: 'overview',
          searchQuery: '',
          searchResults: [],
          isSearching: false,
          collections: [],
          selectedCollectionId: null,
          activeNotebookId: null,
          healthScore: 0,
          decayAlerts: 0,
          duplicateAlerts: 0,
        }),
    }),
    {
      name: 'nexus-cerebro-store',
      partialize: (s) => ({ activeNotebookId: s.activeNotebookId }),
    },
  ),
);
