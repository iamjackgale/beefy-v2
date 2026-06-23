import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type WindowState = {
  /** Whether the browser tab is currently focused and visible (fed by setupListeners). */
  focused: boolean;
};

const initialState: WindowState = {
  focused: true,
};

export const windowSlice = createSlice({
  name: 'window',
  initialState,
  reducers: {
    setWindowFocused(state, action: PayloadAction<boolean>) {
      state.focused = action.payload;
    },
  },
});

export const { setWindowFocused } = windowSlice.actions;
export const windowReducer = windowSlice.reducer;
