'use strict';

import {
    combineReducers,
    createStore,
    bindActionCreators,
    compose,
    applyMiddleware
} from 'redux';

import {Provider, connect} from 'react-redux';
import React, {Component} from 'react';

const composeEnhancers = () => window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ 
    ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({}) 
    : compose;

const namespaceClr = (C, namespace) => class extends Component {
    render () {
        const keys = Object.keys(this.props);
        const newProps = {};
        for (const key of keys) {
            if (key.startsWith(namespace)) {
                newProps[key.replace(namespace, '')] = this.props[key];
            } else {
                newProps[key] = this.props[key];
            }
        }
        return <C {...newProps}/>;
    }
};
const addNamespace = namespace => obj =>
    Object.assign({}, ...Object.keys(obj).map(x => ({[`${namespace}${x}`]: obj[x]})));

const oldToNewMask = namespace => obj => Object.assign({}, ...Object.keys(obj).map(
    x => x.startsWith(namespace) && {[x.replace(namespace, '')]: x} || {[x]: x}
).filter(x => x));
const clearNamespace = namespace => obj => Object.assign({}, ...Object.keys(obj).map(
    x => x.startsWith(namespace) && {[x.replace(namespace, '')]: obj[x]} || undefined
).filter(x => x));

const createPageRedux = serverInitData => {
    const actions = {};
    const mddls = [];
    let _store = null;
    let cmbr = null;
    const rds = {};
    const pageRedux = {
        add: (...r) => {
            r.map(x => {
                if (x.reducers) {
                    pageRedux.addReducers(x.reducers);
                }
                if (x.actions) {
                    pageRedux.addAction(x.actions);
                }
                if (x.middlewares) {
                    pageRedux.addMddl(x.middlewares);
                }
            });
        },
        addReducers: newReds => {
            const list = Object.keys(newReds).map(name => ({[name]: newReds[name](serverInitData)}));
            Object.assign(rds, ...list);
            cmbr = combineReducers(rds);
            if (_store) {
                _store.replaceReducer(cmbr);
            }
        },
        addMddl: mddl => mddls.push(...mddl),
        addAction: act => Object.assign(actions, act),
        createStore: () => createStore(
            cmbr || (() => ({})),
            composeEnhancers()(
                applyMiddleware(...mddls)
            )),
        connect: (App, stateSelecter) => {
            if (!_store) {
                _store = pageRedux.createStore();
            }
            const AppDecor = connect(
                stateSelecter,
                d => ({actions: bindActionCreators(actions, d)})
            )(App);
            return class ReduxApplication extends Component {
                render () {
                    return <Provider store={_store}>
                        <AppDecor store={_store}/>
                    </Provider>;
                }
            };
        },
        namespaced: ({redux, Component: C}, namespace = '', othersStates = () => ({})) => {
            if (!redux) {
                throw new Error('У объекта нет поля redux');
            }
            if (!C) {
                throw new Error('Объект не предоставляет поле Container');
            }
            namespace = namespace && `${namespace }.` || namespace;
            const addNmsps = addNamespace(namespace);
            const clrNmsps = clearNamespace(namespace);
            const oldToNewNmsps = oldToNewMask(namespace);
            let {reducers: originReds, middlewares: mdls, actions: acts, types} = redux;
            if (!originReds) {
                throw new Error('redux не содержит поле reducers');
            }
            /*if (!mdls) {
                throw new Error('redux не содержит поле middlewares');
            }*/
            if (!acts) {
                throw new Error('redux не содержит поле actions');
            }
            if (!types) {
                throw new Error('redux не содержит поле types');
            }
            types = Object.assign({},
                ...Object.keys(types).map(key => ({[key]: `${namespace}${types[key]}`}))
            );
            const reds = originReds ? addNmsps(originReds(types)) : {};
            acts = addNmsps(acts(types));
            if (mdls) {
                mdls = mdls(types, acts);
            }
            pageRedux.add({reducers: reds, actions: acts, middlewares: mdls});
            const Comp = namespaceClr(C, namespace);
            const CompDec = connect(
                st => Object.assign({},
                    ...Object.keys(reds).map(x => ({[x]: st[x]})),
                    othersStates(st),
                ),
                d => ({actions: clrNmsps(bindActionCreators(actions, d))})
            )(Comp);
            class Wrapped extends Component {
                render () {
                    return <CompDec {...this.props} store={_store}/>;
                }
            }
            return {
                Container: Wrapped,
                types,
                state: oldToNewNmsps(reds),
            };
        },
    };
    return pageRedux;
};
export default createPageRedux;