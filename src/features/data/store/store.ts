import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { useStore } from 'react-redux';
import { persistStore } from 'redux-persist';
import { setGlobalDevModeChecks } from 'reselect';
import { initAppData } from '../actions/scenarios.ts';
import { listenerMiddleware } from '../middlewares/listener-middleware.ts';
import { addListeners } from '../middlewares/listener-setup.ts';
import { rootReducer } from '../reducers/reducers.ts';
import { setWindowFocused } from '../reducers/window.ts';

export const store = configureStore({
  reducer: rootReducer,
  devTools: import.meta.env.DEV,
  middleware: getDefaultMiddleware => {
    return getDefaultMiddleware({
      // BigNumber can not be serialized
      serializableCheck: false,
      immutableCheck: import.meta.env.DEV,
    }).prepend(listenerMiddleware);
  },
});

// listeners get added after store is created otherwise there is a type-loop
addListeners();

// track tab focus/visibility so focus-gated work (e.g. the not-calm quote auto-refresh) can pause
// in background tabs and avoid hammering APIs. Uses RTK's setupListeners focus/visibility wiring.
setupListeners(store.dispatch, dispatch => {
  const sync = () =>
    dispatch(setWindowFocused(document.visibilityState === 'visible' && document.hasFocus()));
  window.addEventListener('focus', sync, false);
  window.addEventListener('blur', sync, false);
  document.addEventListener('visibilitychange', sync, false);
  sync();
  return () => {
    window.removeEventListener('focus', sync);
    window.removeEventListener('blur', sync);
    document.removeEventListener('visibilitychange', sync);
  };
});

// start loading global data ASAP
store.dispatch(initAppData);

export const persistor = persistStore(store);

if (import.meta.env.DEV) {
  // TODO can be enabled once selectors fixed to not trigger 1000 lines of console
  setGlobalDevModeChecks({ inputStabilityCheck: 'never', identityFunctionCheck: 'never' });
}

/** @deprecated don't use the store directly */
export type BeefyStore = typeof store;

/** @deprecated don't use the store directly */
export const useAppStore = useStore.withTypes<BeefyStore>();
