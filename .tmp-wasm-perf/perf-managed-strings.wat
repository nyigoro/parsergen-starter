(module
  (import "env" "str_new" (func $str_new (param i32 i32) (result i32)))
  (import "env" "mem_retain" (func $mem_retain (param i32)))
  (import "env" "mem_release" (func $mem_release (param i32)))
  (import "env" "mem_stats_live" (func $mem_stats_live (result i32)))
  (memory (export "memory") 1)
  (global $heap_ptr (mut i32) (i32.const 1024))
  (func $__alloc (param $size i32) (result i32)
    global.get $heap_ptr
    local.get $size
    i32.add
    global.set $heap_ptr
    global.get $heap_ptr
    local.get $size
    i32.sub
  )
  (func $__free (param $ptr i32))
  (export "__alloc" (func $__alloc))
  (export "__free" (func $__free))
  (data (i32.const 0) "x")
  (func $alloc_and_release_many (param $count i32) (result i32)
    (local $i i32)
    (local $s i32)
    i32.const 0
    local.set $i
    (block $done
      (loop $loop
        local.get $i
        local.get $count
        i32.ge_u
        br_if $done
        i32.const 0
        i32.const 1
        call $str_new
        local.tee $s
        call $mem_retain
        local.get $s
        call $mem_release
        local.get $s
        call $mem_release
        local.get $i
        i32.const 1
        i32.add
        local.set $i
        br $loop
      )
    )
    call $mem_stats_live
  )
  (export "alloc_and_release_many" (func $alloc_and_release_many))
)