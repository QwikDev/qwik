import { qwikify$ } from '../vue/qwikify';
import { Button } from 'vant';
//@ts-ignore
import Component from './Component.vue';

export const VueComponent = qwikify$(Component);
export const VantButton = qwikify$(Button);
