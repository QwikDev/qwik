/* eslint-disable */

import type { QRL } from '../../../import/qrl';

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

type QEvent<T extends Function = Function> = QRL<T> | T;

interface QwikGlobalEvents {
  /**
   * Event fired when DOM is first loaded
   */
  'on:qInit'?: QEvent;

  // TODO: document
  'on:qInterval'?: QEvent;

  // TODO: document
  'on:qTimeout'?: QEvent;

  // TODO: document
  'on:qRender'?: QEvent;
}

interface QwikDOMEvents {
  'on:abort'?: QEvent;
  'on:animationend'?: QEvent;
  'on:animationiteration'?: QEvent;
  'on:animationstart'?: QEvent;
  'on:auxclick'?: QEvent;
  'on:beforexrselect'?: QEvent;
  'on:blur'?: QEvent;
  'on:cancel'?: QEvent;
  'on:canplay'?: QEvent;
  'on:canplaythrough'?: QEvent;
  'on:change'?: QEvent;
  'on:click'?: QEvent;
  'on:close'?: QEvent;
  'on:contextmenu'?: QEvent;
  'on:copy'?: QEvent;
  'on:cuechange'?: QEvent;
  'on:cut'?: QEvent;
  'on:dblclick'?: QEvent;
  'on:drag'?: QEvent;
  'on:dragend'?: QEvent;
  'on:dragenter'?: QEvent;
  'on:dragleave'?: QEvent;
  'on:dragover'?: QEvent;
  'on:dragstart'?: QEvent;
  'on:drop'?: QEvent;
  'on:durationchange'?: QEvent;
  'on:emptied'?: QEvent;
  'on:ended'?: QEvent;
  'on:error'?: QEvent;
  'on:focus'?: QEvent;
  'on:formdata'?: QEvent;
  'on:gotpointercapture'?: QEvent;
  'on:input'?: QEvent;
  'on:invalid'?: QEvent;
  'on:keydown'?: QEvent;
  'on:keypress'?: QEvent;
  'on:keyup'?: QEvent;
  'on:load'?: QEvent;
  'on:loadeddata'?: QEvent;
  'on:loadedmetadata'?: QEvent;
  'on:loadstart'?: QEvent;
  'on:lostpointercapture'?: QEvent;
  'on:mousedown'?: QEvent;
  'on:mouseenter'?: QEvent;
  'on:mouseleave'?: QEvent;
  'on:mousemove'?: QEvent;
  'on:mouseout'?: QEvent;
  'on:mouseover'?: QEvent;
  'on:mouseup'?: QEvent;
  'on:mousewheel'?: QEvent;
  'on:paste'?: QEvent;
  'on:pause'?: QEvent;
  'on:play'?: QEvent;
  'on:playing'?: QEvent;
  'on:pointercancel'?: QEvent;
  'on:pointerdown'?: QEvent;
  'on:pointerenter'?: QEvent;
  'on:pointerleave'?: QEvent;
  'on:pointermove'?: QEvent;
  'on:pointerout'?: QEvent;
  'on:pointerover'?: QEvent;
  'on:pointerrawupdate'?: QEvent;
  'on:pointerup'?: QEvent;
  'on:progress'?: QEvent;
  'on:ratechange'?: QEvent;
  'on:reset'?: QEvent;
  'on:resize'?: QEvent;
  'on:scroll'?: QEvent;
  'on:seeked'?: QEvent;
  'on:seeking'?: QEvent;
  'on:select'?: QEvent;
  'on:selectionchange'?: QEvent;
  'on:selectstart'?: QEvent;
  'on:stalled'?: QEvent;
  'on:submit'?: QEvent;
  'on:suspend'?: QEvent;
  'on:timeupdate'?: QEvent;
  'on:toggle'?: QEvent;
  'on:transitioncancel'?: QEvent;
  'on:transitionend'?: QEvent;
  'on:transitionrun'?: QEvent;
  'on:transitionstart'?: QEvent;
  'on:volumechange'?: QEvent;
  'on:waiting'?: QEvent;
  'on:webkitanimationend'?: QEvent;
  'on:webkitanimationiteration'?: QEvent;
  'on:webkitanimationstart'?: QEvent;
  'on:webkittransitionend'?: QEvent;
  'on:wheel'?: QEvent;
}

export interface DOMAttributes<T> extends QwikProps, QwikGlobalEvents, QwikDOMEvents {
  children?: any;
}
