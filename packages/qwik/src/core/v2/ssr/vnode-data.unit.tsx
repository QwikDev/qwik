import { describe, expect, it } from 'vitest';
import { componentQrl } from '../../component/component.public';
import { inlinedQrl } from '../../qrl/qrl';
import { useSignal } from '../../use/use-signal';
import { ssrRenderToDom } from '../rendering.unit-util';
import { codeToName } from '../shared/shared-serialization';
import { encodeAsAlphanumeric } from './vnode-data';

const debug = false;

describe('vnode data', () => {
  describe('encodeAsAlphanumeric', () => {
    it('should return A for 0', () => {
      expect(encodeAsAlphanumeric(0)).toEqual('A');
    });
    it('should return B for 1', () => {
      expect(encodeAsAlphanumeric(1)).toEqual('B');
    });
    it('should return K for 10', () => {
      expect(encodeAsAlphanumeric(10)).toEqual('K');
    });
    it('should return Z for 25', () => {
      expect(encodeAsAlphanumeric(25)).toEqual('Z');
    });
    it('should return bA for 26', () => {
      expect(encodeAsAlphanumeric(26)).toEqual('bA');
    });
    it('should return dW for 100', () => {
      expect(encodeAsAlphanumeric(100)).toEqual('dW');
    });
    it('should return bmM for 1000', () => {
      expect(encodeAsAlphanumeric(1000)).toEqual('bmM');
    });
    it('should return ouQ for 10000', () => {
      expect(encodeAsAlphanumeric(10000)).toEqual('ouQ');
    });
  });
  describe('integration tests', () => {
    it('components inside the div', async () => {
      const Component1 = componentQrl(
        inlinedQrl(() => {
          const data = useSignal(1);
          return (
            <div>
              <span>{data.value}</span>
            </div>
          );
        }, 's_cmp1')
      );
      const Parent = componentQrl(
        inlinedQrl(() => {
          return (
            <div>
              <Component1 />
              <Component1 />
            </div>
          );
        }, 's_parent')
      );

      const { container } = await ssrRenderToDom(<Parent />, { debug });
      const state = container.$rawStateData$;
      const vnodeData = state
        .map((s) => convertQwikJsonToObject(s))
        .filter((data) => data?.codeName === 'VNode')
        .map((data) => data?.dataValue);

      expect(vnodeData).toEqual(['3A', '4A', '4B']);
    });

    it('components inside the fragments', async () => {
      const Component1 = componentQrl(
        inlinedQrl(() => {
          const data = useSignal(1);
          return (
            <>
              <span>{data.value}</span>
            </>
          );
        }, 's_cmp1')
      );
      const Parent = componentQrl(
        inlinedQrl(() => {
          return (
            <>
              <Component1 />
              <Component1 />
            </>
          );
        }, 's_parent')
      );

      const { container } = await ssrRenderToDom(<Parent />, { debug });
      const state = container.$rawStateData$;
      const vnodeData = state
        .map((s) => convertQwikJsonToObject(s))
        .filter((data) => data?.codeName === 'VNode')
        .map((data) => data?.dataValue);

      expect(vnodeData).toEqual(['3A', '3AAA', '3AAB']);
    });

    it('components inside the fragments and divs', async () => {
      const Component1 = componentQrl(
        inlinedQrl(() => {
          const data = useSignal(1);
          return (
            <>
              <span>{data.value}</span>
            </>
          );
        }, 's_cmp1')
      );
      const Parent = componentQrl(
        inlinedQrl(() => {
          return (
            <>
              <div>
                <Component1 />
              </div>
              <Component1 />
              <div>
                <div>
                  <Component1 />
                </div>
              </div>
              <Component1 />
            </>
          );
        }, 's_parent')
      );

      const { container } = await ssrRenderToDom(<Parent />, { debug });
      const state = container.$rawStateData$;
      const vnodeData = state
        .map((s) => convertQwikJsonToObject(s))
        .filter((data) => data?.codeName === 'VNode')
        .map((data) => data?.dataValue);

      expect(vnodeData).toEqual(['3A', '3AAB', '3AAD', '4A', '8A']);
    });

    it('nested components inside the fragments and the divs', async () => {
      const Component1 = componentQrl(
        inlinedQrl(() => {
          const data = useSignal(1);
          return (
            <>
              <span>{data.value}</span>
              <Component2 />
            </>
          );
        }, 's_cmp1')
      );
      const Component2 = componentQrl(
        inlinedQrl(() => {
          const data = useSignal(2);
          return (
            <>
              <span>{data.value}</span>
            </>
          );
        }, 's_cmp2')
      );
      const Parent = componentQrl(
        inlinedQrl(() => {
          return (
            <>
              <div>
                <Component1 />
              </div>
              <Component1 />
              <div>
                <div>
                  <Component1 />
                </div>
              </div>
              <Component1 />
            </>
          );
        }, 's_parent')
      );

      const { container } = await ssrRenderToDom(<Parent />, { debug });
      const state = container.$rawStateData$;
      const vnodeData = state
        .map((s) => convertQwikJsonToObject(s))
        .filter((data) => data?.codeName === 'VNode')
        .map((data) => data?.dataValue);

      expect(vnodeData).toEqual([
        '3AAB',
        '3A',
        '3AAD',
        '4A',
        '10A',
        '3AABAB',
        '3AADAB',
        '4AAB',
        '10AAB',
      ]);
    });
  });
});

function convertQwikJsonToObject(value: any) {
  const json = JSON.stringify(value);
  const regex = /(\\u00([0-9a-f][0-9a-f]))(.*)$/gm;
  const regexData = regex.exec(json);
  if (!regexData) {
    return null;
  }
  const codeName = codeToName(parseInt(regexData[2], 16));
  const dataValue = regexData[3].substring(0, regexData[3].length - 1);

  return {
    codeName,
    dataValue,
  };
}
