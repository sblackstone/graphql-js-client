import assert from 'assert';
import Query from '../src/query';
import typeBundle from '../fixtures/types'; // eslint-disable-line import/no-unresolved
import {resetTracker, startTracking, pauseTracking, trackedTypes, printTypes} from '../src/track-type-dependency';

suite('track-type-dependency-test', () => {
  setup(() => {
    resetTracker();
  });

  test('it reports the types used in a query', () => {
    startTracking();

    // eslint-disable-next-line no-new
    new Query(typeBundle, (root) => {
      root.add('shop', (shop) => {
        shop.add('name');
        shop.addConnection('products', (products) => {
          products.add('handle');
          products.addConnection('variants', (variants) => {
            variants.add('price');
          });
        });
      });
    });

    assert.deepEqual(trackedTypes(), [
      'Boolean',
      'ID',
      'Money',
      'PageInfo',
      'Product',
      'ProductConnection',
      'ProductEdge',
      'ProductVariant',
      'ProductVariantConnection',
      'ProductVariantEdge',
      'QueryRoot',
      'Shop',
      'String'
    ]);
  });

  test('it pauses tracking when `pauseTracking` is called', () => {
    startTracking();

    // eslint-disable-next-line no-new
    new Query(typeBundle, (root) => {
      root.add('shop', (shop) => {
        shop.add('name');
      });
    });

    pauseTracking();

    // eslint-disable-next-line no-new
    new Query(typeBundle, (root) => {
      root.add('shop', (shop) => {
        shop.add('name');
        shop.addConnection('products', (products) => {
          products.add('handle');
          products.addConnection('variants', (variants) => {
            variants.add('price');
          });
        });
      });
    });

    startTracking();

    // eslint-disable-next-line no-new
    new Query(typeBundle, (root) => {
      root.add('node', {id: 'gid://shopfiy/Product/1234'}, (node) => {
        node.add('id');
      });
    });

    assert.deepEqual(trackedTypes(), [
      'ID',
      'Node',
      'QueryRoot',
      'Shop',
      'String'
    ]);
  });

  test('it clears the tracked types when `resetTracker` is called', () => {
    startTracking();

    // eslint-disable-next-line no-new
    new Query(typeBundle, (root) => {
      root.add('shop', (shop) => {
        shop.add('name');
      });
    });

    resetTracker();

    assert.deepEqual(trackedTypes(), []);
  });

  test('it stops tracking when `resetTypes` is called (returning the tracker to it\'s initial state.', () => {
    startTracking();

    resetTracker();

    // eslint-disable-next-line no-new
    new Query(typeBundle, (root) => {
      root.add('shop', (shop) => {
        shop.add('name');
      });
    });

    assert.deepEqual(trackedTypes(), []);
  });

  test('it logs the tracked types when `printTypes` is called', () => {
    startTracking();

    // eslint-disable-next-line no-new
    new Query(typeBundle, (root) => {
      root.add('shop', (shop) => {
        shop.add('name');
      });
    });

    let loggedTypes;

    // eslint-disable-next-line
    const originalLog = console.log;

    // eslint-disable-next-line
    console.log = function (types) {
      loggedTypes = types;
    };

    printTypes();

    // eslint-disable-next-line
    console.log = originalLog;

    assert.deepEqual(loggedTypes, [
      'QueryRoot',
      'Shop',
      'String'
    ].join());
  });
});
