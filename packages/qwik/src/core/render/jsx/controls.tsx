import type { JSXNode } from "@builder.io/qwik";

// If Component

export type IfControl = (props: {
    condition: boolean;
    else?: () => JSXNode;
    children: () => JSXNode;
}) => JSXNode;

export const If: IfControl = (props) => <>{props.condition ? props.children() : props.else ? props.else() : null}</>;

// Switch Component
export type CASE = (props: {
    where: boolean;
    children: () => JSXNode;
}) => JSXNode;

export const Case: CASE = () => <></>;

export type SwitchControl = (props: {
    default?: () => JSXNode;
    children: JSXNode[];
}) => JSXNode;

export const Switch: SwitchControl = (props) => {
    for (const caze of props.children) {
        if (caze.props.where) {
            return caze.props.children();
        }
    }
    return props.default ? props.default() : null;
};

// For Component
export type ForControl = <T, U extends JSXNode>(props: {
    each: T[] | undefined;
    fallback?: () => JSXNode;
    children: (item: T, index: number) => U;
}) => JSXNode;

export const For: ForControl = (props) => {
    const { each, fallback, children } = props;

    // case where each is undefined, so could be loading
    if (each === undefined && fallback) {
        return fallback();
    }

    return <>{
        (!each || !Array.isArray(each) || each.length === 0) ? 
            null :
            each.map((item, i) => children(item, i))
    }</>;
};
