// @ts-nocheck
<template>
  <canvas
    v-if="!!canvasId"
    :type="forceUseOldCanvas?'':'2d'"
    class="ec-canvas"
    :id="canvasId"
    :canvasId="canvasId"
    @touchstart="touchStart"
    @touchmove="touchMove"
    @touchend="touchEnd">
  </canvas>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, getCurrentInstance } from 'vue';
import WxCanvas2 from './wx-canvas2';
import WxCanvas from './wx-canvas';

export default defineComponent({
  name: "awxEcharts",
  props: {
    forceUseOldCanvas: {
      type: Boolean,
      default: false,
    },
    canvasId: {
      type: String,
      default: 'ec-canvas',
    },
    lazyLoad: {
      type: Boolean,
      default: false,
    },
    disableTouch: {
      type: Boolean,
      default: false,
    },
    throttleTouch: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['init'],
  setup (props, context) {
    const instance = getCurrentInstance();
    const isUseNewCanvas = ref<boolean>(true);
    const canvasNode = ref<any>(null);
    const canvas = ref<WxCanvas | WxCanvas2 | null>(null);
    const ctx = ref<any>(null);
    const lastMoveTime = ref<number>(0);

    const compareVersion = (v1s: string, v2s: string) => {
      const v1 = v1s.split('.');
      const v2 = v2s.split('.');
      const len = Math.max(v1.length, v2.length);

      while (v1.length < len) {
        v1.push('0');
      }
      while (v2.length < len) {
        v2.push('0');
      }

      for (let i = 0; i < len; i += 1) {
        const num1 = parseInt(v1[i]);
        const num2 = parseInt(v2[i]);

        if (num1 > num2) {
          return 1;
        } else if (num1 < num2) {
          return -1;
        }
      }
      return 0;
    };

    
    const wrapTouch = (e: any) => {
      for (let i = 0; i < e.mp.touches.length; i += 1) {
        const touch = e.mp.touches[i];
        touch.offsetX = touch.x;
        touch.offsetY = touch.y;
      }
      return e;
    };

    const init = () => {
      const version = wx.getSystemInfoSync().SDKVersion;

      const canUseNewCanvas = compareVersion(version, '2.9.0') >= 0;
      isUseNewCanvas.value = canUseNewCanvas && !props.forceUseOldCanvas;

      if (props.forceUseOldCanvas && canUseNewCanvas) {
        console.warn('开发者强制使用旧canvas,建议关闭');
      }

      if (isUseNewCanvas.value) {
        initByNewWay();
      } else {
        const isValid = compareVersion(version, '1.9.91') >= 0;
        if (!isValid) {
          console.error('微信基础库版本过低，需大于等于 1.9.91。');
        } else {
          console.warn('建议将微信基础库调整大于等于2.9.0版本。升级后绘图将有更好性能');
          initByOldWay();
        }
      }
    };

    const initByNewWay = () => {
      // version >= 2.9.0：使用新的方式初始化
      const { canvasId } = props;
      const query = wx.createSelectorQuery().in(instance);

      query
        .select(`#${canvasId}`)
        .fields({ node: true, size: true })
        .exec((res) => {
          const _canvasNode = res[0].node;
          canvasNode.value = _canvasNode;

          const canvasDpr = wx.getSystemInfoSync().pixelRatio;
          const canvasWidth = res[0].width;
          const canvasHeight = res[0].height;

          const ctx = _canvasNode.getContext('2d');

          const _canvas = new WxCanvas2(ctx, canvasId, true, _canvasNode);

          context.emit('init', {
            canvas: _canvas,
            width: canvasWidth,
            height: canvasHeight,
            dpr: canvasDpr,
          });

          canvas.value = _canvas;
        });
    };

    const initByOldWay = () => {
      // 1.9.91 <= version < 2.9.0：原来的方式初始化
      const { canvasId } = props;
      ctx.value = wx.createCanvasContext(canvasId, instance);

      const _canvas = new WxCanvas(ctx.value, canvasId);

      const canvasDpr = 1;

      const query = wx.createSelectorQuery().in(instance);
      query.select(`#${canvasId}`).boundingClientRect((res) => {
        if (!res) {
          setTimeout(() => init(), 50);
          return;
        }

        const { width, height } = res;

        context.emit('init', {
          canvas: _canvas,
          width: width,
          height: height,
          dpr: canvasDpr,
        });
        canvas.value = _canvas;
      }).exec();
    };

    const canvasToTempFilePath = (opt: Object) => {
      const { canvasId } = props;
      if (isUseNewCanvas.value) {
        // 新版
        const query = wx.createSelectorQuery().in(instance);
        query
          .select(`#${canvasId}`)
          .fields({ node: true, size: true })
          .exec((res) => {
            const canvasNode = res[0].node;
            Object.assign(opt, { canvas: canvasNode });
            wx.canvasToTempFilePath(opt);
          });
      } else {
        // 旧的
        ctx.value.draw(true, () => {
          wx.canvasToTempFilePath({
            canvasId,
            ...opt,
          });
        });
      }
    };

    const touchStart = (e: any) => {
      const { disableTouch } = props;

      console.log('------', e);

      const touches = e.touches || e.mp.touches;

      e.mp = e;

      if (!canvas.value || disableTouch || !canvas.value.chart || !touches.length) return;

      const chart = canvas.value.chart;

      const touch = touches[0];
      const { handler } = chart._zr;
      handler.dispatch('mousedown', Object.assign({
        zrX: touch.x,
        zrY: touch.y,
      }, e));
      handler.dispatch('mousemove', Object.assign({
        zrX: touch.x,
        zrY: touch.y,
      }, e));
      const processGesture = handler.proxy.processGesture || (() => {});
      processGesture(wrapTouch(e), 'start');
    };

    const touchMove = (e: any) => {
      const {
        disableTouch, throttleTouch
      } = props;
      const touches = e.touches || e.mp.touches;
      e.mp = e;
      if (!canvas.value || disableTouch || !canvas.value.chart || !touches.length) return;

      const chart = canvas.value.chart;

      if (throttleTouch) {
        const currMoveTime = Date.now();
        if (currMoveTime - lastMoveTime.value < 150) return;
        lastMoveTime.value = currMoveTime;
      }

      const touch = touches[0];
      const { handler } = chart._zr;
      handler.dispatch('mousemove', Object.assign({
        zrX: touch.x,
        zrY: touch.y,
      }, e));
      const processGesture = handler.proxy.processGesture || (() => {});
      processGesture(wrapTouch(e), 'change');
    };

    const touchEnd = (e: any) => {
      const { disableTouch } = props;
      if (!canvas.value || disableTouch || !canvas.value.chart) return;
      const chart = canvas.value.chart;

      const changedTouches = e.changedTouches || e.mp.changedTouches;
      e.mp = e;

      const touch = changedTouches ? changedTouches[0] : {};
      const { handler } = chart._zr;
      handler.dispatch('mouseup', Object.assign({
        zrX: touch.x,
        zrY: touch.y,
      }, e));
      handler.dispatch('click', Object.assign({
        zrX: touch.x,
        zrY: touch.y,
      }, e));
      const processGesture = handler.proxy.processGesture || (() => {});
      processGesture(wrapTouch(e), 'end');
    };
    
    onMounted(() => {
      if (!props.lazyLoad) {
        init();
      }
    });

    return {
      isUseNewCanvas,
      canvasNode,
      canvas,
      ctx,
      forceUseOldCanvas: props.forceUseOldCanvas,
      canvasId: props.canvasId,
      touchStart,
      touchMove,
      touchEnd
    };
  }
});
</script>

<style scoped>
.ec-canvas {
  width: 100%;
  height: 100%;
}
</style>
