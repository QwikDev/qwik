/* eslint-disable */
import type { EntityConstructor, QRL } from '../../..';

interface QwikProps {
  class?: string | { [className: string]: boolean };
  innerHTML?: string;
  /**
   * Declare `Injector` `Entity` providers.
   *
   * See: `Injector`, `Entity`
   */
  'decl:entity'?: EntityConstructor<any>[];

  /**
   * Declare component template.
   */
  'decl:template'?: QRL;
}

interface QwikGlobalEvents {
  /**
   * Event fired when DOM is first loaded
   */
  'on:qInit'?: QRL;

  // TODO: document
  'on:qInterval'?: QRL;

  // TODO: document
  'on:qTimeout'?: QRL;

  // TODO: document
  'on:qRender'?: QRL;
}

interface QwikDOMEvents {
  'on:abort'?: QRL;
  'on:animationend'?: QRL;
  'on:animationiteration'?: QRL;
  'on:animationstart'?: QRL;
  'on:auxclick'?: QRL;
  'on:beforexrselect'?: QRL;
  'on:blur'?: QRL;
  'on:cancel'?: QRL;
  'on:canplay'?: QRL;
  'on:canplaythrough'?: QRL;
  'on:change'?: QRL;
  'on:click'?: QRL;
  'on:close'?: QRL;
  'on:contextmenu'?: QRL;
  'on:copy'?: QRL;
  'on:cuechange'?: QRL;
  'on:cut'?: QRL;
  'on:dblclick'?: QRL;
  'on:drag'?: QRL;
  'on:dragend'?: QRL;
  'on:dragenter'?: QRL;
  'on:dragleave'?: QRL;
  'on:dragover'?: QRL;
  'on:dragstart'?: QRL;
  'on:drop'?: QRL;
  'on:durationchange'?: QRL;
  'on:emptied'?: QRL;
  'on:ended'?: QRL;
  'on:error'?: QRL;
  'on:focus'?: QRL;
  'on:formdata'?: QRL;
  'on:gotpointercapture'?: QRL;
  'on:input'?: QRL;
  'on:invalid'?: QRL;
  'on:keydown'?: QRL;
  'on:keypress'?: QRL;
  'on:keyup'?: QRL;
  'on:load'?: QRL;
  'on:loadeddata'?: QRL;
  'on:loadedmetadata'?: QRL;
  'on:loadstart'?: QRL;
  'on:lostpointercapture'?: QRL;
  'on:mousedown'?: QRL;
  'on:mouseenter'?: QRL;
  'on:mouseleave'?: QRL;
  'on:mousemove'?: QRL;
  'on:mouseout'?: QRL;
  'on:mouseover'?: QRL;
  'on:mouseup'?: QRL;
  'on:mousewheel'?: QRL;
  'on:paste'?: QRL;
  'on:pause'?: QRL;
  'on:play'?: QRL;
  'on:playing'?: QRL;
  'on:pointercancel'?: QRL;
  'on:pointerdown'?: QRL;
  'on:pointerenter'?: QRL;
  'on:pointerleave'?: QRL;
  'on:pointermove'?: QRL;
  'on:pointerout'?: QRL;
  'on:pointerover'?: QRL;
  'on:pointerrawupdate'?: QRL;
  'on:pointerup'?: QRL;
  'on:progress'?: QRL;
  'on:ratechange'?: QRL;
  'on:reset'?: QRL;
  'on:resize'?: QRL;
  'on:scroll'?: QRL;
  'on:seeked'?: QRL;
  'on:seeking'?: QRL;
  'on:select'?: QRL;
  'on:selectionchange'?: QRL;
  'on:selectstart'?: QRL;
  'on:stalled'?: QRL;
  'on:submit'?: QRL;
  'on:suspend'?: QRL;
  'on:timeupdate'?: QRL;
  'on:toggle'?: QRL;
  'on:transitioncancel'?: QRL;
  'on:transitionend'?: QRL;
  'on:transitionrun'?: QRL;
  'on:transitionstart'?: QRL;
  'on:volumechange'?: QRL;
  'on:waiting'?: QRL;
  'on:webkitanimationend'?: QRL;
  'on:webkitanimationiteration'?: QRL;
  'on:webkitanimationstart'?: QRL;
  'on:webkittransitionend'?: QRL;
  'on:wheel'?: QRL;
}

export interface DOMAttributes<T> extends QwikProps, QwikGlobalEvents, QwikDOMEvents {}
