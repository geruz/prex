'use strict';

import {
    combineReducers,
    createStore,
    bindActionCreators,
    compose,
    applyMiddleware,
} from 'redux';

import {Provider, connect} from 'react-redux';
import React, {Component} from 'react';

const composeEnhancers = () => window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
    ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({})
    : compose;

class Namespacer {
    constructor (namespace) {
        const nsp = `${namespace}:`;
        const clearName = name => name.startsWith(nsp)
            ? name.replace(nsp, '')
            : name;
        this.clear = obj => this._renameObjFields(obj, clearName);

        const addToName = name => `${nsp}${name}`;
        this.add = obj => this._renameObjFields(obj, addToName);

        this.mapping = obj => Object.assign({}, ...Object.keys(obj).map(x => ({[clearName(x)]: x})));

        this.decTypes = types => Object.assign({},
            ...Object.keys(types).map(key => ({[key]: `${nsp}${types[key]}`}))
        );
    }

    _renameObjFields (obj, f) {
        return Object.assign({}, ...Object.keys(obj).map(
            x => ({[f(x)]: obj[x]})));
    }
}
class EmptyNamespacer {
    constructor () {
        this.clear = obj => obj;
        this.add = obj => obj;
        this.mapping = obj => Object.assign({}, ...Object.keys(obj).map(x => ({[x]: x})));
        this.decTypes = obj => obj;
    }
}
const createNamespacer = namespace => namespace
    ? new Namespacer(namespace)
    : new EmptyNamespacer();

const createReduxApp = (AppConnect, getStore) => class ReduxApplication extends Component {
    render () {
        return <Provider store={getStore()}>
            <AppConnect/>
        </Provider>;
    }
};

const bindStore = (Comp, getStore) => props => <Comp {...props} store={getStore()}/>;
class Prex {
    constructor (serverInitData) {
        this.serverInitData = serverInitData;
        this.actions = {};
        this.reducers = {};
        this.mddls = [];
        this.store = null;
        this.getStore = () => this.store;
    }
    add (...r) {
        r.map(x => {
            if (x.reducers) {
                this.addReducers(x.reducers);
            }
            if (x.actions) {
                this.addActions(x.actions);
            }
            if (x.middlewares) {
                this.addMiddlewares(x.middlewares);
            }
        });
    }
    addReducers (reducers) {
        const list = Object.keys(reducers).map(name => ({[name]: reducers[name](this.serverInitData)}));
        this.reducers = Object.assign(this.reducers, ...list);
    }
    addMiddlewares (...mddl) {
        this.mddls.push(...mddl);
    }
    addActions (actions) {
        this.actions = Object.assign(this.actions, actions);
    }
    connect (App, stateSelecter) {
        this.store = this._createStore();
        const AppConnect = connect(
            stateSelecter,
            d => ({actions: bindActionCreators(this.actions, d)})
        )(App);
        return createReduxApp(AppConnect, this.getStore);
    }
    _createStore () {
        const middleawers = applyMiddleware(...this.mddls);
        return createStore(
            combineReducers(this.reducers),
            composeEnhancers()(middleawers)
        );
    }
    namespaced ({redux, Component}, namespace, othersStates = () => ({})) {
        if (!redux) {
            throw new Error('У объекта нет поля redux');
        }
        if (!Component) {
            throw new Error('Объект не предоставляет поле Component');
        }
        const namespacer = createNamespacer(namespace);
        const {reducers, middlewares, actions, types} = redux;
        if (!reducers) {
            throw new Error('redux не содержит поле reducers');
        }
        if (!actions) {
            throw new Error('redux не содержит поле actions');
        }
        if (!types) {
            throw new Error('redux не содержит поле types');
        }
        const newTypes = namespacer.decTypes(types);
        const newReducers = namespacer.add(reducers(newTypes));
        const stateMapping = namespacer.mapping(newReducers);
        this.add({
            reducers: newReducers,
            actions: namespacer.add(actions(newTypes)),
            middlewares: middlewares
                ? middlewares(newTypes, actions)
                : null,
        });
        const ConnectedComp = connect(
            state => Object.assign({},
                ...Object.keys(stateMapping).map(x => ({[x]: state[stateMapping[x]]})),
                othersStates(state),
            ),
            dispatch => ({actions:
                Object.assign({},
                    namespacer.clear(bindActionCreators(this.actions, dispatch)),
                    namespacer.clear(bindActionCreators(actions, dispatch)),
                ),
            })
        )(Component);
        return {
            Container: bindStore(ConnectedComp, this.getStore),
            types: newTypes,
            stateMapping,
        };
    }
}

export default serverInitData => new Prex(serverInitData);
