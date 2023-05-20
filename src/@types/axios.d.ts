import 'axios';

declare module 'axios' {
   interface IBasicResponseData<T = unknown> {
    errNo: number;
    errMsg: string;
    data: T;
    logId: number;
  }

  type IDefaultRequestBodyData = 
    | string
    /* eslint-disable-next-line */
    | object
    | FormData
    | Blob
    | File
    | URLSearchParams
    | ArrayBuffer
    | ArrayBufferView;
}
