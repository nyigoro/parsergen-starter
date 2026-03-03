(module
  (import "env" "print_int" (func $print_int (param i32)))
  (import "env" "print_float" (func $print_float (param f64)))
  (import "env" "print_bool" (func $print_bool (param i32)))
  (import "env" "print_string" (func $print_string (param i32)))
  (import "env" "print_i64" (func $print_i64 (param i64)))
  (import "env" "abs_int" (func $abs_int (param i32) (result i32)))
  (import "env" "abs_float" (func $abs_float (param f64) (result f64)))
  (import "env" "str_new" (func $str_new (param i32 i32) (result i32)))
  (import "env" "str_concat" (func $str_concat (param i32 i32) (result i32)))
  (import "env" "str_len" (func $str_len (param i32) (result i32)))
  (import "env" "str_slice" (func $str_slice (param i32 i32 i32 i32) (result i32)))
  (import "env" "str_eq" (func $str_eq (param i32 i32) (result i32)))
  (import "env" "str_from_int" (func $str_from_int (param i32) (result i32)))
  (import "env" "str_from_i64" (func $str_from_i64 (param i64) (result i32)))
  (import "env" "str_from_u64" (func $str_from_u64 (param i64) (result i32)))
  (import "env" "str_from_float" (func $str_from_float (param f64) (result i32)))
  (import "env" "str_from_bool" (func $str_from_bool (param i32) (result i32)))
  (import "env" "str_from_handle" (func $str_from_handle (param i32) (result i32)))
  (import "env" "promise_resolve_i32" (func $promise_resolve_i32 (param i32) (result i32)))
  (import "env" "promise_resolve_i64" (func $promise_resolve_i64 (param i64) (result i32)))
  (import "env" "promise_resolve_f64" (func $promise_resolve_f64 (param f64) (result i32)))
  (import "env" "promise_await_i32" (func $promise_await_i32 (param i32) (result i32)))
  (import "env" "promise_await_i64" (func $promise_await_i64 (param i32) (result i64)))
  (import "env" "promise_await_f64" (func $promise_await_f64 (param i32) (result f64)))
  (import "env" "promise_is_ready" (func $promise_is_ready (param i32) (result i32)))
  (import "env" "promise_select_first_ready" (func $promise_select_first_ready (param i32 i32) (result i32)))
  (import "env" "module_call0" (func $module_call0 (param i32 i32) (result i32)))
  (import "env" "module_call1" (func $module_call1 (param i32 i32 i32) (result i32)))
  (import "env" "module_call2" (func $module_call2 (param i32 i32 i32 i32) (result i32)))
  (import "env" "module_call3" (func $module_call3 (param i32 i32 i32 i32 i32) (result i32)))
  (import "env" "module_call4" (func $module_call4 (param i32 i32 i32 i32 i32 i32) (result i32)))
  (import "env" "module_call5" (func $module_call5 (param i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (import "env" "module_call_ptr" (func $module_call_ptr (param i32 i32 i32 i32) (result i32)))
  (import "env" "mem_retain" (func $mem_retain (param i32)))
  (import "env" "mem_release" (func $mem_release (param i32)))
  (import "env" "mem_stats_live" (func $mem_stats_live (result i32)))
  (import "env" "vec_new" (func $vec_new (result i32)))
  (import "env" "vec_len" (func $vec_len (param i32) (result i32)))
  (import "env" "vec_push" (func $vec_push (param i32 i32) (result i32)))
  (import "env" "vec_get_has" (func $vec_get_has (param i32 i32) (result i32)))
  (import "env" "vec_get" (func $vec_get (param i32 i32) (result i32)))
  (import "env" "vec_pop_has" (func $vec_pop_has (param i32) (result i32)))
  (import "env" "vec_pop" (func $vec_pop (param i32) (result i32)))
  (import "env" "vec_clear" (func $vec_clear (param i32)))
  (import "env" "vec_take" (func $vec_take (param i32 i32) (result i32)))
  (import "env" "vec_skip" (func $vec_skip (param i32 i32) (result i32)))
  (import "env" "vec_any_closure" (func $vec_any_closure (param i32 i32) (result i32)))
  (import "env" "vec_all_closure" (func $vec_all_closure (param i32 i32) (result i32)))
  (import "env" "vec_map_closure" (func $vec_map_closure (param i32 i32) (result i32)))
  (import "env" "vec_filter_closure" (func $vec_filter_closure (param i32 i32) (result i32)))
  (import "env" "vec_fold_closure" (func $vec_fold_closure (param i32 i32 i32) (result i32)))
  (import "env" "vec_find_has" (func $vec_find_has (param i32 i32) (result i32)))
  (import "env" "vec_find" (func $vec_find (param i32 i32) (result i32)))
  (import "env" "vec_position" (func $vec_position (param i32 i32) (result i32)))
  (import "env" "hashmap_new" (func $hashmap_new (result i32)))
  (import "env" "hashmap_len" (func $hashmap_len (param i32) (result i32)))
  (import "env" "hashmap_insert_has" (func $hashmap_insert_has (param i32 i32 i32) (result i32)))
  (import "env" "hashmap_insert_prev" (func $hashmap_insert_prev (param i32 i32 i32) (result i32)))
  (import "env" "hashmap_get_has" (func $hashmap_get_has (param i32 i32) (result i32)))
  (import "env" "hashmap_get" (func $hashmap_get (param i32 i32) (result i32)))
  (import "env" "hashmap_remove_has" (func $hashmap_remove_has (param i32 i32) (result i32)))
  (import "env" "hashmap_remove" (func $hashmap_remove (param i32 i32) (result i32)))
  (import "env" "hashmap_contains_key" (func $hashmap_contains_key (param i32 i32) (result i32)))
  (import "env" "hashmap_clear" (func $hashmap_clear (param i32)))
  (import "env" "hashset_new" (func $hashset_new (result i32)))
  (import "env" "hashset_len" (func $hashset_len (param i32) (result i32)))
  (import "env" "hashset_insert" (func $hashset_insert (param i32 i32) (result i32)))
  (import "env" "hashset_contains" (func $hashset_contains (param i32 i32) (result i32)))
  (import "env" "hashset_remove" (func $hashset_remove (param i32 i32) (result i32)))
  (import "env" "hashset_clear" (func $hashset_clear (param i32)))
  (memory (export "memory") 1)
  (global $heap_ptr (mut i32) (i32.const 4096))
  (global $free_head (mut i32) (i32.const 0))
  (func $__ensure_capacity (param $needed_end i32)
    (local $current_bytes i32)
    (local $required_pages i32)
    memory.size
    i32.const 65536
    i32.mul
    local.set $current_bytes
    local.get $needed_end
    local.get $current_bytes
    i32.gt_u
    if
      local.get $needed_end
      i32.const 65535
      i32.add
      i32.const 65536
      i32.div_u
      local.set $required_pages
      local.get $required_pages
      memory.size
      i32.sub
      memory.grow
      drop
    end
  )
  (func $alloc (param $size i32) (result i32)
    (local $aligned i32)
    (local $block i32)
    (local $prev i32)
    (local $curr i32)
    (local $curr_size i32)
    (local $next i32)
    (local $needed_end i32)
    local.get $size
    i32.const 7
    i32.add
    i32.const -8
    i32.and
    local.set $aligned
    local.get $aligned
    i32.eqz
    if
      i32.const 8
      local.set $aligned
    end
    i32.const 0
    local.set $prev
    global.get $free_head
    local.set $curr
    (block $search_done
      (loop $search
        local.get $curr
        i32.eqz
        br_if $search_done
        local.get $curr
        i32.load
        local.set $curr_size
        local.get $curr_size
        local.get $aligned
        i32.ge_u
        if
          local.get $curr
          i32.const 4
          i32.add
          i32.load
          local.set $next
          local.get $prev
          i32.eqz
          if
            local.get $next
            global.set $free_head
          else
            local.get $prev
            i32.const 4
            i32.add
            local.get $next
            i32.store
          end
          local.get $curr
          i32.const 8
          i32.add
          return
        end
        local.get $curr
        local.set $prev
        local.get $curr
        i32.const 4
        i32.add
        i32.load
        local.set $curr
        br $search
      )
    )
    global.get $heap_ptr
    local.set $block
    local.get $block
    i32.const 8
    i32.add
    local.get $aligned
    i32.add
    local.set $needed_end
    local.get $needed_end
    call $__ensure_capacity
    local.get $block
    local.get $aligned
    i32.store
    local.get $block
    i32.const 4
    i32.add
    i32.const 0
    i32.store
    local.get $needed_end
    global.set $heap_ptr
    local.get $block
    i32.const 8
    i32.add
  )
  (func $free (param $ptr i32)
    (local $block i32)
    local.get $ptr
    i32.eqz
    if
      return
    end
    local.get $ptr
    i32.const 8
    i32.sub
    local.set $block
    local.get $block
    i32.const 4
    i32.add
    global.get $free_head
    i32.store
    local.get $block
    global.set $free_head
  )
  ;; Struct User
  ;; Total size: 4 bytes
  (func $User_new (param $name i32) (result i32)
    (local $__struct_ptr i32)
    i32.const 4
    call $alloc
    local.set $__struct_ptr
    local.get $__struct_ptr
    local.get $name
    i32.store
    local.get $__struct_ptr
  )
  ;;   field name: offset 0, size 4
  (func $main  (result i32)
  (local $__enum_tmp i32) (local $__tmp_i32 i32) (local $u i32)
    i32.const 32
    i32.const 1
    call $str_new
    call $User_new
    local.set $u
    local.get $u
    call $Printable_User_print
    i32.const 34
    i32.const 3
    call $str_new
    call $str_eq
    (if
      (then
        i32.const 1
        return
      )
      (else
        i32.const 0
        return
      )
    )
    i32.const 0
    return
  )
  (func $Printable_User_print (param $self i32) (result i32)
  (local $__enum_tmp i32) (local $__tmp_i32 i32)
    i32.const 38
    i32.const 2
    call $str_new
    local.get $self
    i32.load
    call $str_concat
    return
  )
  (export "main" (func $main))
  (export "__alloc" (func $alloc))
  (export "__free" (func $free))
  (data (i32.const 32) "\41") ;; "A"
  (data (i32.const 34) "\55\3a\41") ;; "U:A"
  (data (i32.const 38) "\55\3a") ;; "U:"
)
