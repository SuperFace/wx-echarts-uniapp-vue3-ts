declare namespace Public {
  /**
   * 过滤null、void、undefined类型
   */
  type NonNullableWithVoid<T> = T extends (void | null | undefined) ? never : T;

  /**
   * T | Promise<T>
   */
  type OrPromise<T> = T | Promise<T>;
}


