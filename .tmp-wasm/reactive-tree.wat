(module
  (func (export "visible") (param $hidden i32) (param $query i32) (param $first i32) (result i32)
    (if (result i32)
      (i32.eq (local.get $hidden) (i32.const 1))
      (then
        (i32.const 0)
      )
      (else
        (if (result i32)
          (i32.eqz (local.get $query))
          (then
            (i32.const 1)
          )
          (else
            (i32.eq (local.get $first) (local.get $query))
          )
        )
      )
    )
  )
  (func (export "rank") (param $kind i32) (result i32)
    (if (result i32)
      (i32.eq (local.get $kind) (i32.const 0))
      (then
        (i32.const 0)
      )
      (else
        (i32.const 1)
      )
    )
  )
)