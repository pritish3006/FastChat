import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';   // typed version of useSelectorHookm + standard Dispatch and Selector hooks
import type { RootState, AppDispatch } from './index';                            // type definitions for the root state and app dispatch

export const useAppDispatch = () => useDispatch<AppDispatch>();                   // custom hook to access the dispatch function
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;       // custom hook to access the selector function