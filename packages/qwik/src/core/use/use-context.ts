// import {FunctionComponent} from '../render/jsx/types/jsx-node';
// import {jsx} from '../render/jsx/jsx-runtime';
// import { useHostElement } from './use-host-element.public';

// export interface Context<STATE extends object> {
//   id: string,
//   defaultValue: STATE | undefined,
//   Provider: FunctionComponent<{value: STATE, children: any}>,
//   Consumer: FunctionComponent<{children: (state: STATE) => any}>,
// }

// export const SetContent = {} as any;

// export function createContext<STATE extends object>(id: string, defaultValue?: STATE): Context<STATE> {
//   return {
//     id,
//     defaultValue,
//     Provider: (props) => {
//       return jsx(SetContent, {id: id, ...props})
//     },
//     Consumer: () => {
//       return jsx(SetContent, {id: id, ...props})
//     },
//   };
// }

// export function useContext<STATE extends object> (context: Context<STATE>): STATE {
//   const el = useHostElement();
//   const setContext = el.closest(`[context\\:${context.id}]`);
// }

// useContextSet(Context, value);
// useContextGet(Context)
export {};
