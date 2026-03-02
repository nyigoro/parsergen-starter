import {
  Option,
  Result,
  Vec,
  HashMap,
  functor,
  applicative,
  monad,
  foldable,
  traversable,
  vec,
} from '../src/lumina-runtime.js';

const asEnum = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('runtime HKT stdlib helpers', () => {
  test('functor maps Option/Result/Vec/HashMap values', () => {
    const some = functor.map_option(Option.Some(2), (value: number) => value + 1);
    expect(asEnum(some).$tag).toBe('Some');
    expect(asEnum(some).$payload).toBe(3);

    const ok = functor.map_result(Result.Ok(4), (value: number) => value * 2);
    expect(asEnum(ok).$tag).toBe('Ok');
    expect(asEnum(ok).$payload).toBe(8);

    const values = Vec.from([1, 2, 3]);
    const mapped = functor.map_vec(values, (value: number) => value + 10);
    expect(vec.len(mapped)).toBe(3);
    expect(asEnum(vec.get(mapped, 1)).$payload).toBe(12);

    const m = HashMap.new<string, number>();
    m.insert('a', 1);
    m.insert('b', 2);
    const mappedMap = functor.map_hashmap_values(m, (value: number) => value * 3);
    expect(asEnum(mappedMap.get('a')).$payload).toBe(3);
    expect(asEnum(mappedMap.get('b')).$payload).toBe(6);
  });

  test('applicative/monad helpers work for option/result/vec', () => {
    const apSome = applicative.ap_option(Option.Some((x: number) => x + 5), Option.Some(10));
    expect(asEnum(apSome).$tag).toBe('Some');
    expect(asEnum(apSome).$payload).toBe(15);

    const apOk = applicative.ap_result(Result.Ok((x: number) => x - 1), Result.Ok(9));
    expect(asEnum(apOk).$tag).toBe('Ok');
    expect(asEnum(apOk).$payload).toBe(8);

    const flatVec = monad.flat_map_vec(Vec.from([1, 2]), (value: number) => Vec.from([value, value * 10]));
    expect(vec.len(flatVec)).toBe(4);
    expect(asEnum(vec.get(flatVec, 3)).$payload).toBe(20);

    const joinedOption = monad.join_option(Option.Some(Option.Some(7)));
    expect(asEnum(joinedOption).$tag).toBe('Some');
    expect(asEnum(joinedOption).$payload).toBe(7);
  });

  test('foldable and traversable helpers fold and sequence', () => {
    const sum = foldable.fold_vec(Vec.from([1, 2, 3]), 0, (acc: number, value: number) => acc + value);
    expect(sum).toBe(6);

    const reducedOption = foldable.fold_option(Option.Some(4), 10, (acc: number, value: number) => acc + value);
    expect(reducedOption).toBe(14);

    const traversedOption = traversable.traverse_vec_option(Vec.from([1, 2, 3]), (value: number) =>
      value > 0 ? Option.Some(value * 2) : Option.None
    );
    expect(asEnum(traversedOption).$tag).toBe('Some');
    const traversedOptionPayload = asEnum(traversedOption).$payload as Vec<number>;
    expect(vec.len(traversedOptionPayload)).toBe(3);
    expect(asEnum(vec.get(traversedOptionPayload, 2)).$payload).toBe(6);

    const traversedResult = traversable.traverse_vec_result(Vec.from([1, 2, 3]), (value: number) =>
      value < 3 ? Result.Ok(value) : Result.Err('stop')
    );
    expect(asEnum(traversedResult).$tag).toBe('Err');
    expect(asEnum(traversedResult).$payload).toBe('stop');
  });
});
