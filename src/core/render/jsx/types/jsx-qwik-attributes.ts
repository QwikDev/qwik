/* eslint-disable */

import type { QRL } from '../../../import/qrl.public';

interface QwikProps {
  class?: string | { [className: string]: boolean };
  innerHTML?: string;

  /**
   *
   */
  'q:slot'?: string;

  /**
   * URL against which relative QRLs should be resolved to.
   */
  'q:base'?: string;
}

type Event<T extends Function = Function> = T;
type QrlEvent<T extends Event = Event> = QRL<Event>;

interface QwikGlobalEvents {
  /**
   * Event fired when DOM is first loaded
   */
  'on:qInit'?: QrlEvent;
  'on$:qInit'?: Event;

  // TODO: document
  'on:qInterval'?: QrlEvent;
  'on$:qInterval'?: Event;

  // TODO: document
  'on:qTimeout'?: QrlEvent;
  'on$:qTimeout'?: Event;

  // TODO: document
  'on:qRender'?: QrlEvent;
  'on$:qRender'?: Event;
}

interface QwikDOMEvents {
  'on:abort'?: QrlEvent;
  'on$:abort'?: Event;
  'on:animationend'?: QrlEvent;
  'on$:animationend'?: Event;
  'on:animationiteration'?: QrlEvent;
  'on$:animationiteration'?: Event;
  'on:animationstart'?: QrlEvent;
  'on$:animationstart'?: Event;
  'on:auxclick'?: QrlEvent;
  'on$:auxclick'?: Event;
  'on:beforexrselect'?: QrlEvent;
  'on$:beforexrselect'?: Event;
  'on:blur'?: QrlEvent;
  'on$:blur'?: Event;
  'on:cancel'?: QrlEvent;
  'on$:cancel'?: Event;
  'on:canplay'?: QrlEvent;
  'on$:canplay'?: Event;
  'on:canplaythrough'?: QrlEvent;
  'on$:canplaythrough'?: Event;
  'on:change'?: QrlEvent;
  'on$:change'?: Event;
  'on:click'?: QrlEvent;
  'on$:click'?: Event;
  'on:close'?: QrlEvent;
  'on$:close'?: Event;
  'on:contextmenu'?: QrlEvent;
  'on$:contextmenu'?: Event;
  'on:copy'?: QrlEvent;
  'on$:copy'?: Event;
  'on:cuechange'?: QrlEvent;
  'on$:cuechange'?: Event;
  'on:cut'?: QrlEvent;
  'on$:cut'?: Event;
  'on:dblclick'?: QrlEvent;
  'on$:dblclick'?: Event;
  'on:drag'?: QrlEvent;
  'on$:drag'?: Event;
  'on:dragend'?: QrlEvent;
  'on$:dragend'?: Event;
  'on:dragenter'?: QrlEvent;
  'on$:dragenter'?: Event;
  'on:dragleave'?: QrlEvent;
  'on$:dragleave'?: Event;
  'on:dragover'?: QrlEvent;
  'on$:dragover'?: Event;
  'on:dragstart'?: QrlEvent;
  'on$:dragstart'?: Event;
  'on:drop'?: QrlEvent;
  'on$:drop'?: Event;
  'on:durationchange'?: QrlEvent;
  'on$:durationchange'?: Event;
  'on:emptied'?: QrlEvent;
  'on$:emptied'?: Event;
  'on:ended'?: QrlEvent;
  'on$:ended'?: Event;
  'on:error'?: QrlEvent;
  'on$:error'?: Event;
  'on:focus'?: QrlEvent;
  'on$:focus'?: Event;
  'on:formdata'?: QrlEvent;
  'on$:formdata'?: Event;
  'on:gotpointercapture'?: QrlEvent;
  'on$:gotpointercapture'?: Event;
  'on:input'?: QrlEvent;
  'on$:input'?: Event;
  'on:invalid'?: QrlEvent;
  'on$:invalid'?: Event;
  'on:keydown'?: QrlEvent;
  'on$:keydown'?: Event;
  'on:keypress'?: QrlEvent;
  'on$:keypress'?: Event;
  'on:keyup'?: QrlEvent;
  'on$:keyup'?: Event;
  'on:load'?: QrlEvent;
  'on$:load'?: Event;
  'on:loadeddata'?: QrlEvent;
  'on$:loadeddata'?: Event;
  'on:loadedmetadata'?: QrlEvent;
  'on$:loadedmetadata'?: Event;
  'on:loadstart'?: QrlEvent;
  'on$:loadstart'?: Event;
  'on:lostpointercapture'?: QrlEvent;
  'on$:lostpointercapture'?: Event;
  'on:mousedown'?: QrlEvent;
  'on$:mousedown'?: Event;
  'on:mouseenter'?: QrlEvent;
  'on$:mouseenter'?: Event;
  'on:mouseleave'?: QrlEvent;
  'on$:mouseleave'?: Event;
  'on:mousemove'?: QrlEvent;
  'on$:mousemove'?: Event;
  'on:mouseout'?: QrlEvent;
  'on$:mouseout'?: Event;
  'on:mouseover'?: QrlEvent;
  'on$:mouseover'?: Event;
  'on:mouseup'?: QrlEvent;
  'on$:mouseup'?: Event;
  'on:mousewheel'?: QrlEvent;
  'on$:mousewheel'?: Event;
  'on:paste'?: QrlEvent;
  'on$:paste'?: Event;
  'on:pause'?: QrlEvent;
  'on$:pause'?: Event;
  'on:play'?: QrlEvent;
  'on$:play'?: Event;
  'on:playing'?: QrlEvent;
  'on$:playing'?: Event;
  'on:pointercancel'?: QrlEvent;
  'on$:pointercancel'?: Event;
  'on:pointerdown'?: QrlEvent;
  'on$:pointerdown'?: Event;
  'on:pointerenter'?: QrlEvent;
  'on$:pointerenter'?: Event;
  'on:pointerleave'?: QrlEvent;
  'on$:pointerleave'?: Event;
  'on:pointermove'?: QrlEvent;
  'on$:pointermove'?: Event;
  'on:pointerout'?: QrlEvent;
  'on$:pointerout'?: Event;
  'on:pointerover'?: QrlEvent;
  'on$:pointerover'?: Event;
  'on:pointerrawupdate'?: QrlEvent;
  'on$:pointerrawupdate'?: Event;
  'on:pointerup'?: QrlEvent;
  'on$:pointerup'?: Event;
  'on:progress'?: QrlEvent;
  'on$:progress'?: Event;
  'on:ratechange'?: QrlEvent;
  'on$:ratechange'?: Event;
  'on:reset'?: QrlEvent;
  'on$:reset'?: Event;
  'on:resize'?: QrlEvent;
  'on$:resize'?: Event;
  'on:scroll'?: QrlEvent;
  'on$:scroll'?: Event;
  'on:seeked'?: QrlEvent;
  'on$:seeked'?: Event;
  'on:seeking'?: QrlEvent;
  'on$:seeking'?: Event;
  'on:select'?: QrlEvent;
  'on$:select'?: Event;
  'on:selectionchange'?: QrlEvent;
  'on$:selectionchange'?: Event;
  'on:selectstart'?: QrlEvent;
  'on$:selectstart'?: Event;
  'on:stalled'?: QrlEvent;
  'on$:stalled'?: Event;
  'on:submit'?: QrlEvent;
  'on$:submit'?: Event;
  'on:suspend'?: QrlEvent;
  'on$:suspend'?: Event;
  'on:timeupdate'?: QrlEvent;
  'on$:timeupdate'?: Event;
  'on:toggle'?: QrlEvent;
  'on$:toggle'?: Event;
  'on:transitioncancel'?: QrlEvent;
  'on$:transitioncancel'?: Event;
  'on:transitionend'?: QrlEvent;
  'on$:transitionend'?: Event;
  'on:transitionrun'?: QrlEvent;
  'on$:transitionrun'?: Event;
  'on:transitionstart'?: QrlEvent;
  'on$:transitionstart'?: Event;
  'on:volumechange'?: QrlEvent;
  'on$:volumechange'?: Event;
  'on:waiting'?: QrlEvent;
  'on$:waiting'?: Event;
  'on:webkitanimationend'?: QrlEvent;
  'on$:webkitanimationend'?: Event;
  'on:webkitanimationiteration'?: QrlEvent;
  'on$:webkitanimationiteration'?: Event;
  'on:webkitanimationstart'?: QrlEvent;
  'on$:webkitanimationstart'?: Event;
  'on:webkittransitionend'?: QrlEvent;
  'on$:webkittransitionend'?: Event;
  'on:wheel'?: QrlEvent;
  'on$:wheel'?: Event;
}

export interface DOMAttributes<T> extends QwikProps, QwikGlobalEvents, QwikDOMEvents {
  children?: any;
}
