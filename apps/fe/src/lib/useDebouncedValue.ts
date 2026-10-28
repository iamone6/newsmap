import { useEffect, useState } from "react";

/**
 * 값이 바뀌고 일정 시간 동안 더 바뀌지 않을 때만 새 값을 돌려주는 훅. (검색창 입력용)
 * 글자를 칠 때마다 API 를 부르지 않고, 입력이 잠깐 멈췄을 때 한 번만 부르게 해 준다.
 * @param value 원래 값
 * @param delayMs 기다릴 시간(밀리초)
 * @returns 늦게 따라오는 값
 */
export function useDebouncedValue<Value>(value: Value, delayMs: number): Value {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // 시간이 지나기 전에 value 가 또 바뀌면 이전 타이머를 취소한다
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
