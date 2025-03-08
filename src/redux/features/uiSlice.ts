
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UIState, Tool } from '@/types';

const initialState: UIState = {
  availableTools: [
    {
      id: 'file-upload',
      name: 'File Upload',
      description: 'Upload files for processing',
      icon: 'upload',
      isEnabled: true
    },
    {
      id: 'web-search',
      name: 'Web Search',
      description: 'Search the web for information',
      icon: 'search',
      isEnabled: true
    },
    {
      id: 'code-interpreter',
      name: 'Code Interpreter',
      description: 'Run code and display results',
      icon: 'code',
      isEnabled: true
    },
    {
      id: 'image-generation',
      name: 'Image Generation',
      description: 'Generate images from text descriptions',
      icon: 'image',
      isEnabled: true
    }
  ],
  isProfileMenuOpen: false,
  isToolsMenuOpen: false,
  activeTool: null,
  theme: 'light'
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleProfileMenu: (state) => {
      state.isProfileMenuOpen = !state.isProfileMenuOpen;
      // Close other menus
      if (state.isProfileMenuOpen) {
        state.isToolsMenuOpen = false;
      }
    },
    
    setProfileMenuOpen: (state, action: PayloadAction<boolean>) => {
      state.isProfileMenuOpen = action.payload;
    },
    
    toggleToolsMenu: (state) => {
      state.isToolsMenuOpen = !state.isToolsMenuOpen;
      // Close other menus
      if (state.isToolsMenuOpen) {
        state.isProfileMenuOpen = false;
      }
    },
    
    setToolsMenuOpen: (state, action: PayloadAction<boolean>) => {
      state.isToolsMenuOpen = action.payload;
    },
    
    setActiveTool: (state, action: PayloadAction<string | null>) => {
      state.activeTool = action.payload;
    },
    
    toggleToolEnabled: (state, action: PayloadAction<string>) => {
      const toolIndex = state.availableTools.findIndex(tool => tool.id === action.payload);
      if (toolIndex !== -1) {
        state.availableTools[toolIndex].isEnabled = !state.availableTools[toolIndex].isEnabled;
      }
    },
    
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    }
  }
});

export const {
  toggleProfileMenu,
  setProfileMenuOpen,
  toggleToolsMenu,
  setToolsMenuOpen,
  setActiveTool,
  toggleToolEnabled,
  setTheme
} = uiSlice.actions;

export default uiSlice.reducer;
