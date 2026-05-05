import type { ModuleNamespace } from './module-registry-types.js';
import { type Type, freshTypeVar, promiseType } from './types.js';
import { adt, fnType, moduleFunctionWithScheme, primitive, schemeFromVars } from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdUiRenderDomainModules(): Pick<StdDomainModules,
  'renderModule'> {
  const renderModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const signalT = adt('Signal', [t]);
    const memoT = adt('Memo', [t]);
    const effectT = adt('Effect');
    const vnodeT = adt('VNode');
    const rendererT = adt('Renderer');
    const renderRootT = adt('RenderRoot');
    const reactiveRenderRootT = adt('ReactiveRenderRoot');
    const containerT = freshTypeVar();
    const thunkT = fnType([], t);
    const effectFnT = fnType([], primitive('void'));
    const updaterT = fnType([t], t);

    const signalCtorType: Type = fnType([t], signalT);
    const signalGetType: Type = fnType([signalT], t);
    const signalSetType: Type = fnType([signalT, t], primitive('bool'));
    const signalUpdateType: Type = fnType([signalT, updaterT], t);
    const memoCtorType: Type = fnType([thunkT], memoT);
    const memoGetType: Type = fnType([memoT], t);
    const memoDisposeType: Type = fnType([memoT], primitive('void'));
    const effectCtorType: Type = fnType([effectFnT], effectT);
    const effectDisposeType: Type = fnType([effectT], primitive('void'));
    const batchType: Type = fnType([thunkT], t);
    const untrackType: Type = fnType([thunkT], t);
    const textValueT = freshTypeVar();
    const attrsT = freshTypeVar();
    const childrenT = freshTypeVar();
    const fragmentChildrenT = freshTypeVar();
    const rendererFactoryT = freshTypeVar();
    const clickReturnT = freshTypeVar();
    const textType: Type = fnType([textValueT], vnodeT);
    const liveTextSourceT = freshTypeVar();
    const liveTextType: Type = fnType([liveTextSourceT], vnodeT);
    const indexListSourceT = freshTypeVar();
    const indexListType: Type = fnType([
      adt('Signal', [indexListSourceT]),
      fnType([adt('Signal', [primitive('any')]), primitive('int')], vnodeT),
    ], vnodeT);
    const forListSourceT = freshTypeVar();
    const forListType: Type = fnType([
      adt('Signal', [forListSourceT]),
      fnType([primitive('any'), primitive('int')], primitive('any')),
      fnType([adt('Signal', [primitive('any')]), adt('Signal', [primitive('int')])], vnodeT),
    ], vnodeT);
    const keyedChildT = freshTypeVar();
    const keyedType: Type = fnType([primitive('any'), keyedChildT], vnodeT);
    const elementType: Type = fnType([primitive('string'), attrsT, childrenT], vnodeT);
    const fragmentType: Type = fnType([fragmentChildrenT], vnodeT);
    const propsEmptyType: Type = fnType([], primitive('any'));
    const propsClassType: Type = fnType([primitive('string')], primitive('any'));
    const propsOnClickType: Type = fnType([fnType([], clickReturnT)], primitive('any'));
    const propsOnClickDeltaType: Type = fnType([adt('Signal', [primitive('int')]), primitive('int')], primitive('any'));
    const propsOnClickIncType: Type = fnType([adt('Signal', [primitive('int')])], primitive('any'));
    const propsOnClickDecType: Type = fnType([adt('Signal', [primitive('int')])], primitive('any'));
    const propsIdType: Type = fnType([primitive('string')], primitive('any'));
    const propsStyleType: Type = fnType([primitive('string')], primitive('any'));
    const propsValueType: Type = fnType([primitive('string')], primitive('any'));
    const propsCheckedType: Type = fnType([primitive('bool')], primitive('any'));
    const propsTypeType: Type = fnType([primitive('string')], primitive('any'));
    const propsNameType: Type = fnType([primitive('string')], primitive('any'));
    const propsPlaceholderType: Type = fnType([primitive('string')], primitive('any'));
    const propsHrefType: Type = fnType([primitive('string')], primitive('any'));
    const propsDisabledType: Type = fnType([primitive('bool')], primitive('any'));
    const propsKeyValueT = freshTypeVar();
    const propsKeyType: Type = fnType([propsKeyValueT], primitive('any'));
    const propsOnInputType: Type = fnType([fnType([primitive('string')], primitive('void'))], primitive('any'));
    const propsOnChangeType: Type = fnType([fnType([primitive('string')], primitive('void'))], primitive('any'));
    const checkedChangeReturnT = freshTypeVar();
    const submitReturnT = freshTypeVar();
    const propsOnCheckedChangeType: Type = fnType([fnType([primitive('bool')], checkedChangeReturnT)], primitive('any'));
    const propsOnSubmitType: Type = fnType([fnType([], submitReturnT)], primitive('any'));
    const propsMergeLeftT = freshTypeVar();
    const propsMergeRightT = freshTypeVar();
    const propsMergeType: Type = fnType([propsMergeLeftT, propsMergeRightT], primitive('any'));
    const domGetElementByIdType: Type = fnType([primitive('string')], primitive('any'));
    const componentPropsT = freshTypeVar();
    const componentFnType: Type = fnType([componentPropsT], vnodeT);
    const componentType: Type = fnType([componentFnType, componentPropsT], vnodeT);
    const componentKeyedType: Type = fnType([componentFnType, componentPropsT, primitive('any')], vnodeT);
    const renderAppType: Type = componentType;
    const renderToStringAppType: Type = fnType([componentFnType, componentPropsT], primitive('string'));
    const contextDefaultT = freshTypeVar();
    const createContextType: Type = fnType([contextDefaultT], primitive('any'));
    const createRequiredContextType: Type = fnType([], primitive('any'));
    const withContextChildrenType: Type = fnType([], primitive('any'));
    const withContextType: Type = fnType([primitive('any'), primitive('any'), withContextChildrenType], vnodeT);
    const useContextType: Type = fnType([primitive('any')], primitive('any'));
    const stateValueT = freshTypeVar();
    const stateType: Type = fnType([stateValueT], adt('Signal', [stateValueT]));
    const rememberValueT = freshTypeVar();
    const rememberType: Type = fnType([fnType([], rememberValueT)], rememberValueT);
    const resourceHandleType = primitive('any');
    const resourceCreateType: Type = fnType([
      primitive('any'),
      fnType([], promiseType(primitive('any'))),
      primitive('any')
    ], resourceHandleType);
    const resourceStatusType: Type = fnType([resourceHandleType], primitive('string'));
    const resourceValueType: Type = fnType([resourceHandleType], primitive('any'));
    const resourceRefreshType: Type = fnType([resourceHandleType], promiseType(primitive('any')));
    const resourceInvalidateType: Type = fnType([resourceHandleType], primitive('void'));
    const resourceInvalidateKeyType: Type = fnType([primitive('any')], primitive('bool'));
    const resourceInvalidatePrefixType: Type = fnType([primitive('string')], primitive('int'));
    const resourceClearCacheType: Type = fnType([], primitive('void'));
    const suspenseFallbackT = freshTypeVar();
    const suspenseChildrenT = freshTypeVar();
    const suspenseType: Type = fnType([suspenseFallbackT, fnType([], suspenseChildrenT)], vnodeT);
    const errorBoundaryFallbackT = freshTypeVar();
    const errorBoundaryChildrenT = freshTypeVar();
    const errorBoundaryType: Type = fnType([errorBoundaryFallbackT, fnType([], errorBoundaryChildrenT)], vnodeT);
    const showConditionT = freshTypeVar();
    const showChildrenT = freshTypeVar();
    const showFallbackT = freshTypeVar();
    const showType: Type = fnType([showConditionT, fnType([], showChildrenT), showFallbackT], vnodeT);
    const childrenResolveInputT = freshTypeVar();
    const childrenResolveType: Type = fnType([childrenResolveInputT], primitive('any'));
    const slotValueT = freshTypeVar();
    const slotPropsT = freshTypeVar();
    const slotType: Type = fnType([slotValueT, slotPropsT], vnodeT);
    const slotOrValueT = freshTypeVar();
    const slotOrPropsT = freshTypeVar();
    const slotOrFallbackT = freshTypeVar();
    const slotOrType: Type = fnType([slotOrValueT, slotOrPropsT, slotOrFallbackT], vnodeT);
    const composeHandlersType: Type = fnType([primitive('any'), primitive('any')], primitive('any'));
    const portalTargetT = freshTypeVar();
    const portalChildrenT = freshTypeVar();
    const portalType: Type = fnType([portalTargetT, portalChildrenT], vnodeT);
    const portalBodyChildrenT = freshTypeVar();
    const portalBodyType: Type = fnType([portalBodyChildrenT], vnodeT);
    const renderChildrenTypeValueT = freshTypeVar();
    const renderChildrenType: Type = fnType([], renderChildrenTypeValueT);
    const transitionPropsT = freshTypeVar();
    const transitionChildrenT = freshTypeVar();
    const transitionPresenceType: Type = fnType([
      adt('Signal', [primitive('bool')]),
      transitionPropsT,
      primitive('int'),
      fnType([], transitionChildrenT),
    ], vnodeT);
    const propsAttrValueT = freshTypeVar();
    const propsAttrType: Type = fnType([primitive('string'), propsAttrValueT], primitive('any'));
    const propsWhenConditionT = freshTypeVar();
    const propsWhenPropsT = freshTypeVar();
    const propsWhenType: Type = fnType([propsWhenConditionT, propsWhenPropsT], primitive('any'));
    const tabsRootType: Type = fnType([adt('Signal', [primitive('string')]), renderChildrenType], vnodeT);
    const tabsListType: Type = fnType([primitive('any'), renderChildrenType], vnodeT);
    const tabsTriggerType: Type = fnType([primitive('string'), primitive('any'), primitive('any')], vnodeT);
    const tabsPanelType: Type = fnType([primitive('string'), primitive('any'), primitive('any')], vnodeT);
    const dialogRootType: Type = fnType([adt('Signal', [primitive('bool')]), renderChildrenType], vnodeT);
    const dialogPortalType: Type = fnType([primitive('any')], vnodeT);
    const dialogTriggerType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const dialogOverlayType: Type = fnType([primitive('any')], vnodeT);
    const dialogContentType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const dialogTitleType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const dialogDescriptionType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const dialogCloseType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const popoverRootType: Type = fnType([adt('Signal', [primitive('bool')]), renderChildrenType], vnodeT);
    const popoverPortalType: Type = fnType([primitive('any')], vnodeT);
    const popoverTriggerType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const popoverContentType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const tooltipRootType: Type = fnType([adt('Signal', [primitive('bool')]), renderChildrenType], vnodeT);
    const tooltipPortalType: Type = fnType([primitive('any')], vnodeT);
    const tooltipTriggerType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const tooltipContentType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const toastRootType: Type = fnType([adt('Signal', [primitive('bool')]), renderChildrenType], vnodeT);
    const toastPortalType: Type = fnType([primitive('any')], vnodeT);
    const toastContentType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const toastTitleType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const toastDescriptionType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const toastCloseType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const menuRootType: Type = fnType([adt('Signal', [primitive('bool')]), renderChildrenType], vnodeT);
    const menuPortalType: Type = fnType([primitive('any')], vnodeT);
    const menuTriggerType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const menuContentType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const menuItemType: Type = fnType([primitive('string'), primitive('any'), primitive('any')], vnodeT);
    const selectRootType: Type = fnType([adt('Signal', [primitive('bool')]), adt('Signal', [primitive('string')]), renderChildrenType], vnodeT);
    const selectPortalType: Type = fnType([primitive('any')], vnodeT);
    const selectTriggerType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const selectContentType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const selectItemType: Type = fnType([primitive('string'), primitive('any'), renderChildrenType], vnodeT);
    const selectIndicatorType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const comboboxRootType: Type = fnType([
      adt('Signal', [primitive('bool')]),
      adt('Signal', [primitive('string')]),
      adt('Signal', [primitive('string')]),
      renderChildrenType
    ], vnodeT);
    const comboboxPortalType: Type = fnType([primitive('any')], vnodeT);
    const comboboxInputType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const comboboxContentType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const comboboxItemType: Type = fnType([primitive('string'), primitive('any'), renderChildrenType], vnodeT);
    const comboboxIndicatorType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const multiselectRootType: Type = fnType([
      adt('Signal', [primitive('bool')]),
      adt('Signal', [primitive('any')]),
      renderChildrenType
    ], vnodeT);
    const multiselectPortalType: Type = fnType([primitive('any')], vnodeT);
    const multiselectTriggerType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const multiselectContentType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const multiselectItemType: Type = fnType([primitive('string'), primitive('any'), renderChildrenType], vnodeT);
    const multiselectIndicatorType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const checkboxRootType: Type = fnType([adt('Signal', [primitive('bool')]), primitive('any'), renderChildrenType], vnodeT);
    const checkboxIndicatorType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const radioGroupType: Type = fnType([adt('Signal', [primitive('string')]), primitive('any'), renderChildrenType], vnodeT);
    const radioItemType: Type = fnType([primitive('string'), primitive('any'), renderChildrenType], vnodeT);
    const radioIndicatorType: Type = fnType([primitive('any'), primitive('any')], vnodeT);
    const isVNodeType: Type = fnType([primitive('any')], primitive('bool'));
    const serializeType: Type = fnType([vnodeT], primitive('string'));
    const parseType: Type = fnType([primitive('string')], vnodeT);
    const createRendererType: Type = fnType([rendererFactoryT], rendererT);
    const createDomRendererType: Type = fnType([], rendererT);
    const createSsrRendererType: Type = fnType([], rendererT);
    const createCanvasRendererType: Type = fnType([], rendererT);
    const createTerminalRendererType: Type = fnType([], rendererT);
    const renderToStringType: Type = fnType([vnodeT], primitive('string'));
    const renderToTerminalType: Type = fnType([vnodeT], primitive('string'));
    const createRootType: Type = fnType([rendererT, containerT], renderRootT);
    const hydrateType: Type = fnType([rendererT, containerT, vnodeT], renderRootT);
    const mountType: Type = fnType([rendererT, containerT, vnodeT], renderRootT);
    const mountReactiveType: Type = fnType([rendererT, containerT, fnType([], vnodeT)], reactiveRenderRootT);
    const hydrateReactiveType: Type = fnType([rendererT, containerT, fnType([], vnodeT)], reactiveRenderRootT);
    const mountAppType: Type = fnType([rendererT, containerT, componentFnType, componentPropsT], reactiveRenderRootT);
    const hydrateAppType: Type = fnType([rendererT, containerT, componentFnType, componentPropsT], reactiveRenderRootT);
    const testingCreateDomHarnessType: Type = fnType([], primitive('any'));
    const testingMountAppType: Type = fnType([primitive('any'), componentFnType, componentPropsT], reactiveRenderRootT);
    const testingHydrateAppType: Type = fnType([primitive('any'), componentFnType, componentPropsT], reactiveRenderRootT);
    const testingContainerType: Type = fnType([primitive('any')], primitive('any'));
    const testingGetByIdType: Type = fnType([primitive('any'), primitive('string')], primitive('any'));
    const testingGetByTextType: Type = fnType([primitive('any'), primitive('string')], primitive('any'));
    const testingGetByRoleType: Type = fnType([primitive('any'), primitive('string')], primitive('any'));
    const testingQueryAllByRoleType: Type = fnType([primitive('any'), primitive('string')], primitive('any'));
    const testingTextContentType: Type = fnType([primitive('any')], primitive('string'));
    const testingClickType: Type = fnType([primitive('any')], primitive('void'));
    const testingInputType: Type = fnType([primitive('any'), primitive('string')], primitive('void'));
    const testingChangeCheckedType: Type = fnType([primitive('any'), primitive('bool')], primitive('void'));
    const testingKeydownType: Type = fnType([primitive('any'), primitive('string'), primitive('bool')], primitive('void'));
    const testingSubmitType: Type = fnType([primitive('any')], primitive('void'));
    const devtoolsSnapshotType: Type = fnType([], primitive('any'));
    const installDevtoolsType: Type = fnType([], primitive('any'));
    const devtoolsRecordEventType: Type = fnType(
      [primitive('string'), primitive('string'), primitive('any')],
      primitive('any')
    );
    const devtoolsTimelineType: Type = fnType([], primitive('any'));
    const devtoolsClearTimelineType: Type = fnType([], primitive('void'));
    const ssgPageType: Type = fnType([primitive('any'), primitive('any')], primitive('string'));
    const ssgRenderAppType: Type = fnType([componentFnType, componentPropsT, primitive('any')], primitive('string'));
    const ssgWritePageType: Type = fnType([primitive('string'), primitive('any'), primitive('any')], primitive('string'));
    const ssgWriteAppType: Type = fnType([primitive('string'), componentFnType, componentPropsT, primitive('any')], primitive('string'));
    const mountCustomElementType: Type = fnType([primitive('any'), componentFnType, primitive('any')], primitive('any'));
    const defineCustomElementType: Type = fnType([primitive('string'), componentFnType, primitive('any')], primitive('any'));
    const updateType: Type = fnType([renderRootT, vnodeT], primitive('void'));
    const unmountType: Type = fnType([renderRootT], primitive('void'));
    const disposeReactiveType: Type = fnType([reactiveRenderRootT], primitive('void'));

    return {
      kind: 'module',
      name: 'render',
      moduleId: 'std://render',
      exports: new Map([
        [
          'signal',
          moduleFunctionWithScheme(
            'signal',
            ['any'],
            'Signal<any>',
            schemeFromVars(signalCtorType, [t]),
            ['initial'],
            'std://render'
          ),
        ],
        [
          'get',
          moduleFunctionWithScheme(
            'get',
            ['Signal<any>'],
            'any',
            schemeFromVars(signalGetType, [t]),
            ['signal'],
            'std://render'
          ),
        ],
        [
          'peek',
          moduleFunctionWithScheme(
            'peek',
            ['Signal<any>'],
            'any',
            schemeFromVars(signalGetType, [t]),
            ['signal'],
            'std://render'
          ),
        ],
        [
          'set',
          moduleFunctionWithScheme(
            'set',
            ['Signal<any>', 'any'],
            'bool',
            schemeFromVars(signalSetType, [t]),
            ['signal', 'value'],
            'std://render'
          ),
        ],
        [
          'update_signal',
          moduleFunctionWithScheme(
            'update_signal',
            ['Signal<any>', 'fn(any) -> any'],
            'any',
            schemeFromVars(signalUpdateType, [t]),
            ['signal', 'updater'],
            'std://render'
          ),
        ],
        [
          'memo',
          moduleFunctionWithScheme(
            'memo',
            ['fn() -> any'],
            'Memo<any>',
            schemeFromVars(memoCtorType, [t]),
            ['compute'],
            'std://render'
          ),
        ],
        [
          'memo_get',
          moduleFunctionWithScheme(
            'memo_get',
            ['Memo<any>'],
            'any',
            schemeFromVars(memoGetType, [t]),
            ['memo'],
            'std://render'
          ),
        ],
        [
          'memo_peek',
          moduleFunctionWithScheme(
            'memo_peek',
            ['Memo<any>'],
            'any',
            schemeFromVars(memoGetType, [t]),
            ['memo'],
            'std://render'
          ),
        ],
        [
          'memo_dispose',
          moduleFunctionWithScheme(
            'memo_dispose',
            ['Memo<any>'],
            'void',
            schemeFromVars(memoDisposeType, [t]),
            ['memo'],
            'std://render'
          ),
        ],
        [
          'effect',
          moduleFunctionWithScheme(
            'effect',
            ['fn() -> void'],
            'Effect',
            schemeFromVars(effectCtorType, []),
            ['run'],
            'std://render'
          ),
        ],
        [
          'dispose_effect',
          moduleFunctionWithScheme(
            'dispose_effect',
            ['Effect'],
            'void',
            schemeFromVars(effectDisposeType, []),
            ['effect'],
            'std://render'
          ),
        ],
        [
          'batch',
          moduleFunctionWithScheme(
            'batch',
            ['fn() -> any'],
            'any',
            schemeFromVars(batchType, [t]),
            ['block'],
            'std://render'
          ),
        ],
        [
          'untrack',
          moduleFunctionWithScheme(
            'untrack',
            ['fn() -> any'],
            'any',
            schemeFromVars(untrackType, [t]),
            ['block'],
            'std://render'
          ),
        ],
        [
          'text',
          moduleFunctionWithScheme(
            'text',
            ['any'],
            'VNode',
            schemeFromVars(textType, [textValueT]),
            ['value'],
            'std://render'
          ),
        ],
        [
          'liveText',
          moduleFunctionWithScheme(
            'liveText',
            ['any'],
            'VNode',
            schemeFromVars(liveTextType, [liveTextSourceT]),
            ['signal'],
            'std://render'
          ),
        ],
        [
          'indexList',
          moduleFunctionWithScheme(
            'indexList',
            ['Signal<any>', 'fn(Signal<any>, int) -> VNode'],
            'VNode',
            schemeFromVars(indexListType, []),
            ['items', 'renderItem'],
            'std://render'
          ),
        ],
        [
          'forList',
          moduleFunctionWithScheme(
            'forList',
            ['Signal<any>', 'fn(any, int) -> any', 'fn(Signal<any>, Signal<int>) -> VNode'],
            'VNode',
            schemeFromVars(forListType, []),
            ['items', 'keyOf', 'renderItem'],
            'std://render'
          ),
        ],
        [
          'keyed',
          moduleFunctionWithScheme(
            'keyed',
            ['any', 'any'],
            'VNode',
            schemeFromVars(keyedType, [keyedChildT]),
            ['key', 'child'],
            'std://render'
          ),
        ],
        [
          'element',
          moduleFunctionWithScheme(
            'element',
            ['string', 'any', 'any'],
            'VNode',
            schemeFromVars(elementType, [attrsT, childrenT]),
            ['tag', 'props', 'children'],
            'std://render'
          ),
        ],
        [
          'vnode',
          moduleFunctionWithScheme(
            'vnode',
            ['string', 'any', 'any'],
            'VNode',
            schemeFromVars(elementType, [attrsT, childrenT]),
            ['tag', 'props', 'children'],
            'std://render'
          ),
        ],
        [
          'props_empty',
          moduleFunctionWithScheme(
            'props_empty',
            [],
            'any',
            schemeFromVars(propsEmptyType, []),
            [],
            'std://render'
          ),
        ],
        [
          'props_class',
          moduleFunctionWithScheme(
            'props_class',
            ['any'],
            'any',
            schemeFromVars(propsClassType, []),
            ['className'],
            'std://render'
          ),
        ],
        [
          'props_on_click',
          moduleFunctionWithScheme(
            'props_on_click',
            ['fn() -> any'],
            'any',
            schemeFromVars(propsOnClickType, [clickReturnT]),
            ['handler'],
            'std://render'
          ),
        ],
        [
          'props_on_click_delta',
          moduleFunctionWithScheme(
            'props_on_click_delta',
            ['Signal<int>', 'int'],
            'any',
            schemeFromVars(propsOnClickDeltaType, []),
            ['signal', 'delta'],
            'std://render'
          ),
        ],
        [
          'props_on_click_inc',
          moduleFunctionWithScheme(
            'props_on_click_inc',
            ['Signal<int>'],
            'any',
            schemeFromVars(propsOnClickIncType, []),
            ['signal'],
            'std://render'
          ),
        ],
        [
          'props_on_click_dec',
          moduleFunctionWithScheme(
            'props_on_click_dec',
            ['Signal<int>'],
            'any',
            schemeFromVars(propsOnClickDecType, []),
            ['signal'],
            'std://render'
          ),
        ],
        [
          'props_id',
          moduleFunctionWithScheme(
            'props_id',
            ['string'],
            'any',
            schemeFromVars(propsIdType, []),
            ['id'],
            'std://render'
          ),
        ],
        [
          'props_style',
          moduleFunctionWithScheme(
            'props_style',
            ['string'],
            'any',
            schemeFromVars(propsStyleType, []),
            ['style'],
            'std://render'
          ),
        ],
        [
          'props_value',
          moduleFunctionWithScheme(
            'props_value',
            ['string'],
            'any',
            schemeFromVars(propsValueType, []),
            ['value'],
            'std://render'
          ),
        ],
        [
          'props_checked',
          moduleFunctionWithScheme(
            'props_checked',
            ['bool'],
            'any',
            schemeFromVars(propsCheckedType, []),
            ['checked'],
            'std://render'
          ),
        ],
        [
          'props_type',
          moduleFunctionWithScheme(
            'props_type',
            ['string'],
            'any',
            schemeFromVars(propsTypeType, []),
            ['type'],
            'std://render'
          ),
        ],
        [
          'props_name',
          moduleFunctionWithScheme(
            'props_name',
            ['string'],
            'any',
            schemeFromVars(propsNameType, []),
            ['name'],
            'std://render'
          ),
        ],
        [
          'props_placeholder',
          moduleFunctionWithScheme(
            'props_placeholder',
            ['string'],
            'any',
            schemeFromVars(propsPlaceholderType, []),
            ['placeholder'],
            'std://render'
          ),
        ],
        [
          'props_href',
          moduleFunctionWithScheme(
            'props_href',
            ['string'],
            'any',
            schemeFromVars(propsHrefType, []),
            ['href'],
            'std://render'
          ),
        ],
        [
          'props_disabled',
          moduleFunctionWithScheme(
            'props_disabled',
            ['bool'],
            'any',
            schemeFromVars(propsDisabledType, []),
            ['disabled'],
            'std://render'
          ),
        ],
        [
          'props_key',
          moduleFunctionWithScheme(
            'props_key',
            ['any'],
            'any',
            schemeFromVars(propsKeyType, [propsKeyValueT]),
            ['key'],
            'std://render'
          ),
        ],
        [
          'props_on_input',
          moduleFunctionWithScheme(
            'props_on_input',
            ['fn(string) -> void'],
            'any',
            schemeFromVars(propsOnInputType, []),
            ['handler'],
            'std://render'
          ),
        ],
        [
          'props_on_change',
          moduleFunctionWithScheme(
            'props_on_change',
            ['fn(string) -> void'],
            'any',
            schemeFromVars(propsOnChangeType, []),
            ['handler'],
            'std://render'
          ),
        ],
        [
          'props_on_checked_change',
          moduleFunctionWithScheme(
            'props_on_checked_change',
            ['fn(bool) -> any'],
            'any',
            schemeFromVars(propsOnCheckedChangeType, [checkedChangeReturnT]),
            ['handler'],
            'std://render'
          ),
        ],
        [
          'props_on_submit',
          moduleFunctionWithScheme(
            'props_on_submit',
            ['fn() -> any'],
            'any',
            schemeFromVars(propsOnSubmitType, [submitReturnT]),
            ['handler'],
            'std://render'
          ),
        ],
        [
          'props_attr',
          moduleFunctionWithScheme(
            'props_attr',
            ['string', 'any'],
            'any',
            schemeFromVars(propsAttrType, [propsAttrValueT]),
            ['name', 'value'],
            'std://render'
          ),
        ],
        [
          'props_when',
          moduleFunctionWithScheme(
            'props_when',
            ['any', 'any'],
            'any',
            schemeFromVars(propsWhenType, [propsWhenConditionT, propsWhenPropsT]),
            ['condition', 'props'],
            'std://render'
          ),
        ],
        [
          'props_merge',
          moduleFunctionWithScheme(
            'props_merge',
            ['any', 'any'],
            'any',
            schemeFromVars(propsMergeType, [propsMergeLeftT, propsMergeRightT]),
            ['left', 'right'],
            'std://render'
          ),
        ],
        [
          'dom_get_element_by_id',
          moduleFunctionWithScheme(
            'dom_get_element_by_id',
            ['string'],
            'any',
            schemeFromVars(domGetElementByIdType, []),
            ['id'],
            'std://render'
          ),
        ],
        [
          'component',
          moduleFunctionWithScheme(
            'component',
            ['fn(any) -> VNode', 'any'],
            'VNode',
            schemeFromVars(componentType, [componentPropsT]),
            ['renderFn', 'props'],
            'std://render'
          ),
        ],
        [
          'component_keyed',
          moduleFunctionWithScheme(
            'component_keyed',
            ['fn(any) -> VNode', 'any', 'any'],
            'VNode',
            schemeFromVars(componentKeyedType, [componentPropsT]),
            ['renderFn', 'props', 'key'],
            'std://render'
          ),
        ],
        [
          'renderApp',
          moduleFunctionWithScheme(
            'renderApp',
            ['fn(any) -> VNode', 'any'],
            'VNode',
            schemeFromVars(renderAppType, [componentPropsT]),
            ['renderFn', 'props'],
            'std://render'
          ),
        ],
        [
          'renderToStringApp',
          moduleFunctionWithScheme(
            'renderToStringApp',
            ['fn(any) -> VNode', 'any'],
            'string',
            schemeFromVars(renderToStringAppType, [componentPropsT]),
            ['renderFn', 'props'],
            'std://render'
          ),
        ],
        [
          'create_context',
          moduleFunctionWithScheme(
            'create_context',
            ['any'],
            'any',
            schemeFromVars(createContextType, [contextDefaultT]),
            ['defaultValue'],
            'std://render'
          ),
        ],
        [
          'create_required_context',
          moduleFunctionWithScheme(
            'create_required_context',
            [],
            'any',
            schemeFromVars(createRequiredContextType, []),
            [],
            'std://render'
          ),
        ],
        [
          'with_context',
          moduleFunctionWithScheme(
            'with_context',
            ['any', 'any', 'fn() -> any'],
            'VNode',
            schemeFromVars(withContextType, []),
            ['context', 'value', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'use_context',
          moduleFunctionWithScheme(
            'use_context',
            ['any'],
            'any',
            schemeFromVars(useContextType, []),
            ['context'],
            'std://render'
          ),
        ],
        [
          'state',
          moduleFunctionWithScheme(
            'state',
            ['any'],
            'Signal<any>',
            schemeFromVars(stateType, [stateValueT]),
            ['initial'],
            'std://render'
          ),
        ],
        [
          'remember',
          moduleFunctionWithScheme(
            'remember',
            ['fn() -> any'],
            'any',
            schemeFromVars(rememberType, [rememberValueT]),
            ['compute'],
            'std://render'
          ),
        ],
        [
          'transitionPresence',
          moduleFunctionWithScheme(
            'transitionPresence',
            ['Signal<bool>', 'any', 'int', 'fn() -> any'],
            'VNode',
            schemeFromVars(transitionPresenceType, [transitionPropsT, transitionChildrenT]),
            ['open', 'props', 'durationMs', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'createResource',
          moduleFunctionWithScheme(
            'createResource',
            ['any', 'fn() -> Promise<any>', 'any'],
            'any',
            schemeFromVars(resourceCreateType, []),
            ['key', 'loader', 'options'],
            'std://render'
          ),
        ],
        [
          'resourceStatus',
          moduleFunctionWithScheme(
            'resourceStatus',
            ['any'],
            'string',
            schemeFromVars(resourceStatusType, []),
            ['resource'],
            'std://render'
          ),
        ],
        [
          'resourceData',
          moduleFunctionWithScheme(
            'resourceData',
            ['any'],
            'any',
            schemeFromVars(resourceValueType, []),
            ['resource'],
            'std://render'
          ),
        ],
        [
          'resourceError',
          moduleFunctionWithScheme(
            'resourceError',
            ['any'],
            'any',
            schemeFromVars(resourceValueType, []),
            ['resource'],
            'std://render'
          ),
        ],
        [
          'resourceRead',
          moduleFunctionWithScheme(
            'resourceRead',
            ['any'],
            'any',
            schemeFromVars(resourceValueType, []),
            ['resource'],
            'std://render'
          ),
        ],
        [
          'resourceRefresh',
          moduleFunctionWithScheme(
            'resourceRefresh',
            ['any'],
            'Promise<any>',
            schemeFromVars(resourceRefreshType, []),
            ['resource'],
            'std://render'
          ),
        ],
        [
          'resourceInvalidate',
          moduleFunctionWithScheme(
            'resourceInvalidate',
            ['any'],
            'void',
            schemeFromVars(resourceInvalidateType, []),
            ['resource'],
            'std://render'
          ),
        ],
        ['resourceInvalidateKey', moduleFunctionWithScheme('resourceInvalidateKey', ['any'], 'bool', schemeFromVars(resourceInvalidateKeyType, []), ['key'], 'std://render')],
        ['resourceInvalidatePrefix', moduleFunctionWithScheme('resourceInvalidatePrefix', ['string'], 'int', schemeFromVars(resourceInvalidatePrefixType, []), ['prefix'], 'std://render')],
        ['resourceInvalidateTag', moduleFunctionWithScheme('resourceInvalidateTag', ['string'], 'int', schemeFromVars(resourceInvalidatePrefixType, []), ['tag'], 'std://render')],
        ['resourceInvalidateDependency', moduleFunctionWithScheme('resourceInvalidateDependency', ['string'], 'int', schemeFromVars(resourceInvalidatePrefixType, []), ['dependency'], 'std://render')],
        ['resourceInvalidateScope', moduleFunctionWithScheme('resourceInvalidateScope', ['string'], 'int', schemeFromVars(resourceInvalidatePrefixType, []), ['scope'], 'std://render')],
        ['resourceClearCache', moduleFunctionWithScheme('resourceClearCache', [], 'void', schemeFromVars(resourceClearCacheType, []), [], 'std://render')],
        ['resourceClearScope', moduleFunctionWithScheme('resourceClearScope', ['string'], 'int', schemeFromVars(resourceInvalidatePrefixType, []), ['scope'], 'std://render')],
        [
          'resourceMutate',
          moduleFunctionWithScheme(
            'resourceMutate',
            ['any', 'any'],
            'any',
            schemeFromVars(fnType([resourceHandleType, primitive('any')], primitive('any')), []),
            ['resource', 'value'],
            'std://render'
          ),
        ],
        [
          'suspense',
          moduleFunctionWithScheme(
            'suspense',
            ['any', 'fn() -> any'],
            'VNode',
            schemeFromVars(suspenseType, [suspenseFallbackT, suspenseChildrenT]),
            ['fallback', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'errorBoundary',
          moduleFunctionWithScheme(
            'errorBoundary',
            ['any', 'fn() -> any'],
            'VNode',
            schemeFromVars(errorBoundaryType, [errorBoundaryFallbackT, errorBoundaryChildrenT]),
            ['fallback', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'show',
          moduleFunctionWithScheme(
            'show',
            ['any', 'fn() -> any', 'any'],
            'VNode',
            schemeFromVars(showType, [showConditionT, showChildrenT, showFallbackT]),
            ['condition', 'renderChildren', 'fallback'],
            'std://render'
          ),
        ],
        [
          'children',
          moduleFunctionWithScheme(
            'children',
            ['any'],
            'any',
            schemeFromVars(childrenResolveType, [childrenResolveInputT]),
            ['input'],
            'std://render'
          ),
        ],
        [
          'slot',
          moduleFunctionWithScheme(
            'slot',
            ['any', 'any'],
            'VNode',
            schemeFromVars(slotType, [slotValueT, slotPropsT]),
            ['slotValue', 'props'],
            'std://render'
          ),
        ],
        [
          'slot_or',
          moduleFunctionWithScheme(
            'slot_or',
            ['any', 'any', 'any'],
            'VNode',
            schemeFromVars(slotOrType, [slotOrValueT, slotOrPropsT, slotOrFallbackT]),
            ['slotValue', 'props', 'fallback'],
            'std://render'
          ),
        ],
        [
          'compose_handlers',
          moduleFunctionWithScheme(
            'compose_handlers',
            ['any', 'any'],
            'any',
            schemeFromVars(composeHandlersType, []),
            ['left', 'right'],
            'std://render'
          ),
        ],
        [
          'portal',
          moduleFunctionWithScheme(
            'portal',
            ['any', 'any'],
            'VNode',
            schemeFromVars(portalType, [portalTargetT, portalChildrenT]),
            ['target', 'children'],
            'std://render'
          ),
        ],
        [
          'portalBody',
          moduleFunctionWithScheme(
            'portalBody',
            ['any'],
            'VNode',
            schemeFromVars(portalBodyType, [portalBodyChildrenT]),
            ['children'],
            'std://render'
          ),
        ],
        [
          'tabsRoot',
          moduleFunctionWithScheme(
            'tabsRoot',
            ['Signal<string>', 'fn() -> any'],
            'VNode',
            schemeFromVars(tabsRootType, []),
            ['value', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'tabsList',
          moduleFunctionWithScheme(
            'tabsList',
            ['any', 'fn() -> any'],
            'VNode',
            schemeFromVars(tabsListType, []),
            ['props', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'tabsTrigger',
          moduleFunctionWithScheme(
            'tabsTrigger',
            ['string', 'any', 'any'],
            'VNode',
            schemeFromVars(tabsTriggerType, []),
            ['value', 'props', 'children'],
            'std://render'
          ),
        ],
        [
          'tabsPanel',
          moduleFunctionWithScheme(
            'tabsPanel',
            ['string', 'any', 'any'],
            'VNode',
            schemeFromVars(tabsPanelType, []),
            ['value', 'props', 'children'],
            'std://render'
          ),
        ],
        [
          'dialogRoot',
          moduleFunctionWithScheme(
            'dialogRoot',
            ['Signal<bool>', 'fn() -> any'],
            'VNode',
            schemeFromVars(dialogRootType, []),
            ['open', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'dialogPortal',
          moduleFunctionWithScheme(
            'dialogPortal',
            ['any'],
            'VNode',
            schemeFromVars(dialogPortalType, []),
            ['children'],
            'std://render'
          ),
        ],
        [
          'dialogTrigger',
          moduleFunctionWithScheme(
            'dialogTrigger',
            ['any', 'any'],
            'VNode',
            schemeFromVars(dialogTriggerType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'dialogOverlay',
          moduleFunctionWithScheme(
            'dialogOverlay',
            ['any'],
            'VNode',
            schemeFromVars(dialogOverlayType, []),
            ['props'],
            'std://render'
          ),
        ],
        [
          'dialogContent',
          moduleFunctionWithScheme(
            'dialogContent',
            ['any', 'any'],
            'VNode',
            schemeFromVars(dialogContentType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'dialogTitle',
          moduleFunctionWithScheme(
            'dialogTitle',
            ['any', 'any'],
            'VNode',
            schemeFromVars(dialogTitleType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'dialogDescription',
          moduleFunctionWithScheme(
            'dialogDescription',
            ['any', 'any'],
            'VNode',
            schemeFromVars(dialogDescriptionType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'dialogClose',
          moduleFunctionWithScheme(
            'dialogClose',
            ['any', 'any'],
            'VNode',
            schemeFromVars(dialogCloseType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'popoverRoot',
          moduleFunctionWithScheme(
            'popoverRoot',
            ['Signal<bool>', 'fn() -> any'],
            'VNode',
            schemeFromVars(popoverRootType, []),
            ['open', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'popoverPortal',
          moduleFunctionWithScheme(
            'popoverPortal',
            ['any'],
            'VNode',
            schemeFromVars(popoverPortalType, []),
            ['children'],
            'std://render'
          ),
        ],
        [
          'popoverTrigger',
          moduleFunctionWithScheme(
            'popoverTrigger',
            ['any', 'any'],
            'VNode',
            schemeFromVars(popoverTriggerType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'popoverContent',
          moduleFunctionWithScheme(
            'popoverContent',
            ['any', 'any'],
            'VNode',
            schemeFromVars(popoverContentType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'tooltipRoot',
          moduleFunctionWithScheme(
            'tooltipRoot',
            ['Signal<bool>', 'fn() -> any'],
            'VNode',
            schemeFromVars(tooltipRootType, []),
            ['open', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'tooltipPortal',
          moduleFunctionWithScheme(
            'tooltipPortal',
            ['any'],
            'VNode',
            schemeFromVars(tooltipPortalType, []),
            ['children'],
            'std://render'
          ),
        ],
        [
          'tooltipTrigger',
          moduleFunctionWithScheme(
            'tooltipTrigger',
            ['any', 'any'],
            'VNode',
            schemeFromVars(tooltipTriggerType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'tooltipContent',
          moduleFunctionWithScheme(
            'tooltipContent',
            ['any', 'any'],
            'VNode',
            schemeFromVars(tooltipContentType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'toastRoot',
          moduleFunctionWithScheme(
            'toastRoot',
            ['Signal<bool>', 'fn() -> any'],
            'VNode',
            schemeFromVars(toastRootType, []),
            ['open', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'toastPortal',
          moduleFunctionWithScheme(
            'toastPortal',
            ['any'],
            'VNode',
            schemeFromVars(toastPortalType, []),
            ['children'],
            'std://render'
          ),
        ],
        [
          'toastContent',
          moduleFunctionWithScheme(
            'toastContent',
            ['any', 'any'],
            'VNode',
            schemeFromVars(toastContentType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'toastTitle',
          moduleFunctionWithScheme(
            'toastTitle',
            ['any', 'any'],
            'VNode',
            schemeFromVars(toastTitleType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'toastDescription',
          moduleFunctionWithScheme(
            'toastDescription',
            ['any', 'any'],
            'VNode',
            schemeFromVars(toastDescriptionType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'toastClose',
          moduleFunctionWithScheme(
            'toastClose',
            ['any', 'any'],
            'VNode',
            schemeFromVars(toastCloseType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'menuRoot',
          moduleFunctionWithScheme(
            'menuRoot',
            ['Signal<bool>', 'fn() -> any'],
            'VNode',
            schemeFromVars(menuRootType, []),
            ['open', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'menuPortal',
          moduleFunctionWithScheme(
            'menuPortal',
            ['any'],
            'VNode',
            schemeFromVars(menuPortalType, []),
            ['children'],
            'std://render'
          ),
        ],
        [
          'menuTrigger',
          moduleFunctionWithScheme(
            'menuTrigger',
            ['any', 'any'],
            'VNode',
            schemeFromVars(menuTriggerType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'menuContent',
          moduleFunctionWithScheme(
            'menuContent',
            ['any', 'any'],
            'VNode',
            schemeFromVars(menuContentType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'menuItem',
          moduleFunctionWithScheme(
            'menuItem',
            ['string', 'any', 'any'],
            'VNode',
            schemeFromVars(menuItemType, []),
            ['value', 'props', 'children'],
            'std://render'
          ),
        ],
        [
          'selectRoot',
          moduleFunctionWithScheme(
            'selectRoot',
            ['Signal<bool>', 'Signal<string>', 'fn() -> any'],
            'VNode',
            schemeFromVars(selectRootType, []),
            ['open', 'value', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'selectPortal',
          moduleFunctionWithScheme(
            'selectPortal',
            ['any'],
            'VNode',
            schemeFromVars(selectPortalType, []),
            ['children'],
            'std://render'
          ),
        ],
        [
          'selectTrigger',
          moduleFunctionWithScheme(
            'selectTrigger',
            ['any', 'any'],
            'VNode',
            schemeFromVars(selectTriggerType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'selectContent',
          moduleFunctionWithScheme(
            'selectContent',
            ['any', 'any'],
            'VNode',
            schemeFromVars(selectContentType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'selectItem',
          moduleFunctionWithScheme(
            'selectItem',
            ['string', 'any', 'fn() -> any'],
            'VNode',
            schemeFromVars(selectItemType, []),
            ['value', 'props', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'selectIndicator',
          moduleFunctionWithScheme(
            'selectIndicator',
            ['any', 'any'],
            'VNode',
            schemeFromVars(selectIndicatorType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'comboboxRoot',
          moduleFunctionWithScheme(
            'comboboxRoot',
            ['Signal<bool>', 'Signal<string>', 'Signal<string>', 'fn() -> any'],
            'VNode',
            schemeFromVars(comboboxRootType, []),
            ['open', 'value', 'query', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'comboboxPortal',
          moduleFunctionWithScheme(
            'comboboxPortal',
            ['any'],
            'VNode',
            schemeFromVars(comboboxPortalType, []),
            ['children'],
            'std://render'
          ),
        ],
        [
          'comboboxInput',
          moduleFunctionWithScheme(
            'comboboxInput',
            ['any', 'any'],
            'VNode',
            schemeFromVars(comboboxInputType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'comboboxContent',
          moduleFunctionWithScheme(
            'comboboxContent',
            ['any', 'any'],
            'VNode',
            schemeFromVars(comboboxContentType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'comboboxItem',
          moduleFunctionWithScheme(
            'comboboxItem',
            ['string', 'any', 'fn() -> any'],
            'VNode',
            schemeFromVars(comboboxItemType, []),
            ['value', 'props', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'comboboxIndicator',
          moduleFunctionWithScheme(
            'comboboxIndicator',
            ['any', 'any'],
            'VNode',
            schemeFromVars(comboboxIndicatorType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'multiselectRoot',
          moduleFunctionWithScheme(
            'multiselectRoot',
            ['Signal<bool>', 'Signal<any>', 'fn() -> any'],
            'VNode',
            schemeFromVars(multiselectRootType, []),
            ['open', 'values', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'multiselectPortal',
          moduleFunctionWithScheme(
            'multiselectPortal',
            ['any'],
            'VNode',
            schemeFromVars(multiselectPortalType, []),
            ['children'],
            'std://render'
          ),
        ],
        [
          'multiselectTrigger',
          moduleFunctionWithScheme(
            'multiselectTrigger',
            ['any', 'any'],
            'VNode',
            schemeFromVars(multiselectTriggerType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'multiselectContent',
          moduleFunctionWithScheme(
            'multiselectContent',
            ['any', 'any'],
            'VNode',
            schemeFromVars(multiselectContentType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'multiselectItem',
          moduleFunctionWithScheme(
            'multiselectItem',
            ['string', 'any', 'fn() -> any'],
            'VNode',
            schemeFromVars(multiselectItemType, []),
            ['value', 'props', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'multiselectIndicator',
          moduleFunctionWithScheme(
            'multiselectIndicator',
            ['any', 'any'],
            'VNode',
            schemeFromVars(multiselectIndicatorType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'checkboxRoot',
          moduleFunctionWithScheme(
            'checkboxRoot',
            ['Signal<bool>', 'any', 'fn() -> any'],
            'VNode',
            schemeFromVars(checkboxRootType, []),
            ['checked', 'props', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'checkboxIndicator',
          moduleFunctionWithScheme(
            'checkboxIndicator',
            ['any', 'any'],
            'VNode',
            schemeFromVars(checkboxIndicatorType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'radioGroup',
          moduleFunctionWithScheme(
            'radioGroup',
            ['Signal<string>', 'any', 'fn() -> any'],
            'VNode',
            schemeFromVars(radioGroupType, []),
            ['value', 'props', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'radioItem',
          moduleFunctionWithScheme(
            'radioItem',
            ['string', 'any', 'fn() -> any'],
            'VNode',
            schemeFromVars(radioItemType, []),
            ['value', 'props', 'renderChildren'],
            'std://render'
          ),
        ],
        [
          'radioIndicator',
          moduleFunctionWithScheme(
            'radioIndicator',
            ['any', 'any'],
            'VNode',
            schemeFromVars(radioIndicatorType, []),
            ['props', 'children'],
            'std://render'
          ),
        ],
        [
          'fragment',
          moduleFunctionWithScheme(
            'fragment',
            ['any'],
            'VNode',
            schemeFromVars(fragmentType, [fragmentChildrenT]),
            ['children'],
            'std://render'
          ),
        ],
        [
          'is_vnode',
          moduleFunctionWithScheme(
            'is_vnode',
            ['any'],
            'bool',
            schemeFromVars(isVNodeType, []),
            ['value'],
            'std://render'
          ),
        ],
        [
          'serialize',
          moduleFunctionWithScheme(
            'serialize',
            ['VNode'],
            'string',
            schemeFromVars(serializeType, []),
            ['node'],
            'std://render'
          ),
        ],
        [
          'parse',
          moduleFunctionWithScheme(
            'parse',
            ['string'],
            'VNode',
            schemeFromVars(parseType, []),
            ['json'],
            'std://render'
          ),
        ],
        [
          'create_renderer',
          moduleFunctionWithScheme(
            'create_renderer',
            ['any'],
            'Renderer',
            schemeFromVars(createRendererType, [rendererFactoryT]),
            ['renderer'],
            'std://render'
          ),
        ],
        [
          'create_dom_renderer',
          moduleFunctionWithScheme(
            'create_dom_renderer',
            [],
            'Renderer',
            schemeFromVars(createDomRendererType, []),
            [],
            'std://render'
          ),
        ],
        [
          'createDomRenderer',
          moduleFunctionWithScheme(
            'createDomRenderer',
            [],
            'Renderer',
            schemeFromVars(createDomRendererType, []),
            [],
            'std://render'
          ),
        ],
        [
          'create_ssr_renderer',
          moduleFunctionWithScheme(
            'create_ssr_renderer',
            [],
            'Renderer',
            schemeFromVars(createSsrRendererType, []),
            [],
            'std://render'
          ),
        ],
        [
          'create_canvas_renderer',
          moduleFunctionWithScheme(
            'create_canvas_renderer',
            [],
            'Renderer',
            schemeFromVars(createCanvasRendererType, []),
            [],
            'std://render'
          ),
        ],
        [
          'create_terminal_renderer',
          moduleFunctionWithScheme(
            'create_terminal_renderer',
            [],
            'Renderer',
            schemeFromVars(createTerminalRendererType, []),
            [],
            'std://render'
          ),
        ],
        [
          'render_to_string',
          moduleFunctionWithScheme(
            'render_to_string',
            ['VNode'],
            'string',
            schemeFromVars(renderToStringType, []),
            ['node'],
            'std://render'
          ),
        ],
        [
          'render_to_terminal',
          moduleFunctionWithScheme(
            'render_to_terminal',
            ['VNode'],
            'string',
            schemeFromVars(renderToTerminalType, []),
            ['node'],
            'std://render'
          ),
        ],
        [
          'create_root',
          moduleFunctionWithScheme(
            'create_root',
            ['Renderer', 'any'],
            'RenderRoot',
            schemeFromVars(createRootType, [containerT]),
            ['renderer', 'container'],
            'std://render'
          ),
        ],
        [
          'hydrate',
          moduleFunctionWithScheme(
            'hydrate',
            ['Renderer', 'any', 'VNode'],
            'RenderRoot',
            schemeFromVars(hydrateType, [containerT]),
            ['renderer', 'container', 'node'],
            'std://render'
          ),
        ],
        [
          'mount_reactive',
          moduleFunctionWithScheme(
            'mount_reactive',
            ['Renderer', 'any', 'fn() -> VNode'],
            'ReactiveRenderRoot',
            schemeFromVars(mountReactiveType, [containerT]),
            ['renderer', 'container', 'view'],
            'std://render'
          ),
        ],
        [
          'hydrate_reactive',
          moduleFunctionWithScheme(
            'hydrate_reactive',
            ['Renderer', 'any', 'fn() -> VNode'],
            'ReactiveRenderRoot',
            schemeFromVars(hydrateReactiveType, [containerT]),
            ['renderer', 'container', 'view'],
            'std://render'
          ),
        ],
        [
          'mountApp',
          moduleFunctionWithScheme(
            'mountApp',
            ['Renderer', 'any', 'fn(any) -> VNode', 'any'],
            'ReactiveRenderRoot',
            schemeFromVars(mountAppType, [containerT, componentPropsT]),
            ['renderer', 'container', 'renderFn', 'props'],
            'std://render'
          ),
        ],
        [
          'hydrateApp',
          moduleFunctionWithScheme(
            'hydrateApp',
            ['Renderer', 'any', 'fn(any) -> VNode', 'any'],
            'ReactiveRenderRoot',
            schemeFromVars(hydrateAppType, [containerT, componentPropsT]),
            ['renderer', 'container', 'renderFn', 'props'],
            'std://render'
          ),
        ],
        [
          'testingCreateDomHarness',
          moduleFunctionWithScheme(
            'testingCreateDomHarness',
            [],
            'any',
            schemeFromVars(testingCreateDomHarnessType, []),
            [],
            'std://render'
          ),
        ],
        [
          'testingMountApp',
          moduleFunctionWithScheme(
            'testingMountApp',
            ['any', 'fn(any) -> VNode', 'any'],
            'ReactiveRenderRoot',
            schemeFromVars(testingMountAppType, [componentPropsT]),
            ['harness', 'renderFn', 'props'],
            'std://render'
          ),
        ],
        [
          'testingHydrateApp',
          moduleFunctionWithScheme(
            'testingHydrateApp',
            ['any', 'fn(any) -> VNode', 'any'],
            'ReactiveRenderRoot',
            schemeFromVars(testingHydrateAppType, [componentPropsT]),
            ['harness', 'renderFn', 'props'],
            'std://render'
          ),
        ],
        [
          'testingContainer',
          moduleFunctionWithScheme(
            'testingContainer',
            ['any'],
            'any',
            schemeFromVars(testingContainerType, []),
            ['harness'],
            'std://render'
          ),
        ],
        [
          'testingBody',
          moduleFunctionWithScheme(
            'testingBody',
            ['any'],
            'any',
            schemeFromVars(testingContainerType, []),
            ['harness'],
            'std://render'
          ),
        ],
        [
          'testingGetById',
          moduleFunctionWithScheme(
            'testingGetById',
            ['any', 'string'],
            'any',
            schemeFromVars(testingGetByIdType, []),
            ['harness', 'id'],
            'std://render'
          ),
        ],
        [
          'testingGetByText',
          moduleFunctionWithScheme(
            'testingGetByText',
            ['any', 'string'],
            'any',
            schemeFromVars(testingGetByTextType, []),
            ['scope', 'value'],
            'std://render'
          ),
        ],
        [
          'testingGetByRole',
          moduleFunctionWithScheme(
            'testingGetByRole',
            ['any', 'string'],
            'any',
            schemeFromVars(testingGetByRoleType, []),
            ['scope', 'role'],
            'std://render'
          ),
        ],
        [
          'testingQueryAllByRole',
          moduleFunctionWithScheme(
            'testingQueryAllByRole',
            ['any', 'string'],
            'any',
            schemeFromVars(testingQueryAllByRoleType, []),
            ['scope', 'role'],
            'std://render'
          ),
        ],
        [
          'testingTextContent',
          moduleFunctionWithScheme(
            'testingTextContent',
            ['any'],
            'string',
            schemeFromVars(testingTextContentType, []),
            ['node'],
            'std://render'
          ),
        ],
        [
          'testingClick',
          moduleFunctionWithScheme(
            'testingClick',
            ['any'],
            'void',
            schemeFromVars(testingClickType, []),
            ['node'],
            'std://render'
          ),
        ],
        [
          'testingInput',
          moduleFunctionWithScheme(
            'testingInput',
            ['any', 'string'],
            'void',
            schemeFromVars(testingInputType, []),
            ['node', 'value'],
            'std://render'
          ),
        ],
        [
          'testingChangeChecked',
          moduleFunctionWithScheme(
            'testingChangeChecked',
            ['any', 'bool'],
            'void',
            schemeFromVars(testingChangeCheckedType, []),
            ['node', 'checked'],
            'std://render'
          ),
        ],
        [
          'testingKeydown',
          moduleFunctionWithScheme(
            'testingKeydown',
            ['any', 'string', 'bool'],
            'void',
            schemeFromVars(testingKeydownType, []),
            ['node', 'key', 'shiftKey'],
            'std://render'
          ),
        ],
        [
          'testingSubmit',
          moduleFunctionWithScheme(
            'testingSubmit',
            ['any'],
            'void',
            schemeFromVars(testingSubmitType, []),
            ['node'],
            'std://render'
          ),
        ],
        [
          'devtoolsSnapshot',
          moduleFunctionWithScheme(
            'devtoolsSnapshot',
            [],
            'any',
            schemeFromVars(devtoolsSnapshotType, []),
            [],
            'std://render'
          ),
        ],
        [
          'installDevtools',
          moduleFunctionWithScheme(
            'installDevtools',
            [],
            'any',
            schemeFromVars(installDevtoolsType, []),
            [],
            'std://render'
          ),
        ],
        [
          'devtoolsRecordEvent',
          moduleFunctionWithScheme(
            'devtoolsRecordEvent',
            ['string', 'string', 'any'],
            'any',
            schemeFromVars(devtoolsRecordEventType, []),
            ['eventType', 'label', 'detail'],
            'std://render'
          ),
        ],
        [
          'devtoolsTimeline',
          moduleFunctionWithScheme(
            'devtoolsTimeline',
            [],
            'any',
            schemeFromVars(devtoolsTimelineType, []),
            [],
            'std://render'
          ),
        ],
        [
          'devtoolsClearTimeline',
          moduleFunctionWithScheme(
            'devtoolsClearTimeline',
            [],
            'void',
            schemeFromVars(devtoolsClearTimelineType, []),
            [],
            'std://render'
          ),
        ],
        [
          'ssgPage',
          moduleFunctionWithScheme(
            'ssgPage',
            ['any', 'any'],
            'string',
            schemeFromVars(ssgPageType, []),
            ['body', 'options'],
            'std://render'
          ),
        ],
        [
          'ssgRenderApp',
          moduleFunctionWithScheme(
            'ssgRenderApp',
            ['fn(any) -> VNode', 'any', 'any'],
            'string',
            schemeFromVars(ssgRenderAppType, [componentPropsT]),
            ['renderFn', 'props', 'options'],
            'std://render'
          ),
        ],
        [
          'ssgWritePage',
          moduleFunctionWithScheme(
            'ssgWritePage',
            ['string', 'any', 'any'],
            'string',
            schemeFromVars(ssgWritePageType, []),
            ['filePath', 'body', 'options'],
            'std://render'
          ),
        ],
        [
          'ssgWriteApp',
          moduleFunctionWithScheme(
            'ssgWriteApp',
            ['string', 'fn(any) -> VNode', 'any', 'any'],
            'string',
            schemeFromVars(ssgWriteAppType, [componentPropsT]),
            ['filePath', 'renderFn', 'props', 'options'],
            'std://render'
          ),
        ],
        [
          'mountCustomElement',
          moduleFunctionWithScheme(
            'mountCustomElement',
            ['any', 'fn(any) -> VNode', 'any'],
            'any',
            schemeFromVars(mountCustomElementType, [componentPropsT]),
            ['host', 'renderFn', 'options'],
            'std://render'
          ),
        ],
        [
          'defineCustomElement',
          moduleFunctionWithScheme(
            'defineCustomElement',
            ['string', 'fn(any) -> VNode', 'any'],
            'any',
            schemeFromVars(defineCustomElementType, [componentPropsT]),
            ['tagName', 'renderFn', 'options'],
            'std://render'
          ),
        ],
        [
          'mount',
          moduleFunctionWithScheme(
            'mount',
            ['Renderer', 'any', 'VNode'],
            'RenderRoot',
            schemeFromVars(mountType, [containerT]),
            ['renderer', 'container', 'node'],
            'std://render'
          ),
        ],
        [
          'update',
          moduleFunctionWithScheme(
            'update',
            ['RenderRoot', 'VNode'],
            'void',
            schemeFromVars(updateType, []),
            ['root', 'node'],
            'std://render'
          ),
        ],
        [
          'unmount',
          moduleFunctionWithScheme(
            'unmount',
            ['RenderRoot'],
            'void',
            schemeFromVars(unmountType, []),
            ['root'],
            'std://render'
          ),
        ],
        [
          'dispose_reactive',
          moduleFunctionWithScheme(
            'dispose_reactive',
            ['ReactiveRenderRoot'],
            'void',
            schemeFromVars(disposeReactiveType, []),
            ['root'],
            'std://render'
          ),
        ],
      ]),
    };
  })();

  return { renderModule };
}
