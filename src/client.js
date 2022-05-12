import Document from './document';
import Query from './query';
import Mutation from './mutation';
import Operation from './operation';
import decode from './decode';
import ClassRegistry from './class-registry';
import httpFetcher from './http-fetcher';
import enumFunction from './enum';
import variableFunction from './variable';

export {default as GraphModel} from './graph-model';
export {ClassRegistry};
export {default as decode} from './decode';

function hasNextPage(paginatedModels) {
  return paginatedModels && paginatedModels.length && paginatedModels[paginatedModels.length - 1].hasNextPage;
}

/**
 * The Client class used to create and send GraphQL documents, fragments, queries and mutations.
 */
export default class Client {

  /**
   * @param {Object} typeBundle A set of ES6 modules generated by {@link https://github.com/Shopify/graphql-js-schema|graphql-js-schema}.
   * @param {Object} options An options object. Must include either `url` and optional `fetcherOptions` OR a `fetcher` function.
   *   @param {(String|Function)} options.url|fetcher Either the URL of the GraphQL API endpoint, or a custom fetcher function for further customization.
   *   @param {Object} [options.fetcherOptions] Additional options to use with `fetch`, like headers. Do not specify this argument if `fetcher` is specified.
   *   @param {ClassRegistry} [options.registry=new ClassRegistry()] A {@link ClassRegistry} used to decode the response data.
   */
  constructor(typeBundle, {url, fetcherOptions, fetcher, registry = new ClassRegistry()}) {
    this.typeBundle = typeBundle;
    this.classRegistry = registry;

    if (url && fetcher) {
      throw new Error('Arguments not supported: supply either `url` and optional `fetcherOptions` OR use a `fetcher` function for further customization.');
    }

    if (url) {
      this.fetcher = httpFetcher(url, fetcherOptions);
    } else if (fetcher) {
      if (fetcherOptions) {
        throw new Error('Arguments not supported: when specifying your own `fetcher`, set options through it and not with `fetcherOptions`');
      }

      this.fetcher = fetcher;
    } else {
      throw new Error('Invalid arguments: one of `url` or `fetcher` is needed.');
    }
  }

  /**
   * Creates a GraphQL document.
   *
   * @example
   * const document = client.document();
   *
   * @return {Document} A GraphQL document.
   */
  document() {
    return new Document(this.typeBundle);
  }

  /**
   * Creates a GraphQL query.
   *
   * @example
   * const query = client.query('myQuery', (root) => {
   *   root.add('cat', (cat) => {
   *    cat.add('name');
   *   });
   * });
   *
   * @param {String} [name] A name for the query.
   * @param {VariableDefinition[]} [variables] A list of variables in the query. See {@link Client#variable}.
   * @param {Function} selectionSetCallback The query builder callback.
   *   A {@link SelectionSet} is created using this callback.
   * @return {Query} A GraphQL query.
   */
  query(...args) {
    return new Query(this.typeBundle, ...args);
  }

  /**
   * Creates a GraphQL mutation.
   *
   * @example
   * const input = client.variable('input', 'CatCreateInput!');
   *
   * const mutation = client.mutation('myMutation', [input], (root) => {
   *   root.add('catCreate', {args: {input}}, (catCreate) => {
   *     catCreate.add('cat', (cat) => {
   *       cat.add('name');
   *     });
   *   });
   * });
   *
   * @param {String} [name] A name for the mutation.
   * @param {VariableDefinition[]} [variables] A list of variables in the mutation. See {@link Client#variable}.
   * @param {Function} selectionSetCallback The mutation builder callback.
   *   A {@link SelectionSet} is created using this callback.
   * @return {Mutation} A GraphQL mutation.
   */
  mutation(...args) {
    return new Mutation(this.typeBundle, ...args);
  }

  /**
   * Sends a GraphQL operation (query or mutation) or a document.
   *
   * @example
   * client.send(query, {id: '12345'}).then((result) => {
   *   // Do something with the returned result
   *   console.log(result);
   * });
   *
   * @param {(Query|Mutation|Document|Function)} request The operation or document to send. If represented
   * as a function, it must return `Query`, `Mutation`, or `Document` and recieve the client as the only param.
   * @param {Object} [variableValues] The values for variables in the operation or document.
   * @param {Object} [otherProperties] Other properties to send with the query. For example, a custom operation name.
   * @param {Object} [headers] Additional headers to be applied on a request by request basis.
   * @return {Promise.<Object>} A promise resolving to an object containing the response data.
   */
  send(request, variableValues = null, otherProperties = null, headers = null, inContextDirective = null) {
    let operationOrDocument;

    if (Function.prototype.isPrototypeOf(request)) {
      operationOrDocument = request(this);
    } else {
      operationOrDocument = request;
    }

    const graphQLParams = {query: operationOrDocument.toString(inContextDirective)};

    if (variableValues) {
      graphQLParams.variables = variableValues;
    }

    Object.assign(graphQLParams, otherProperties);

    let operation;

    if (Operation.prototype.isPrototypeOf(operationOrDocument)) {
      operation = operationOrDocument;
    } else {
      const document = operationOrDocument;

      if (document.operations.length === 1) {
        operation = document.operations[0];
      } else if (otherProperties.operationName) {
        operation = document.operations.find((documentOperation) => documentOperation.name === otherProperties.operationName);
      } else {
        throw new Error(`
          A document must contain exactly one operation, or an operationName
          must be specified. Example:

            client.send(document, null, {operationName: 'myFancyQuery'});
        `);
      }
    }

    return this.fetcher(graphQLParams, headers).then((response) => {
      if (response.data) {
        response.model = decode(operation, response.data, {
          classRegistry: this.classRegistry,
          variableValues
        });
      }

      return response;
    });
  }

  /**
   * Fetches the next page of a paginated node or array of nodes.
   *
   * @example
   * client.fetchNextPage(node, {first: 10}).then((result) => {
   *   // Do something with the next page
   *   console.log(result);
   * });
   *
   * @param {(GraphModel|GraphModel[])} nodeOrNodes The node or list of nodes on which to fetch the next page.
   * @param {Object} [options] Options object containing:
   *   @param {Integer} [options.first] The number of nodes to query on the next page. Defaults to the page size of the previous query.
   * @return {Promise.<GraphModel[]>} A promise resolving with the next page of {@link GraphModel}s.
   */
  fetchNextPage(nodeOrNodes, options) {
    let node;

    if (Array.isArray(nodeOrNodes)) {
      node = nodeOrNodes[nodeOrNodes.length - 1];
    } else {
      node = nodeOrNodes;
    }

    const [query, path] = node.nextPageQueryAndPath();
    let variableValues;

    if (node.variableValues || options) {
      variableValues = Object.assign({}, node.variableValues, options);
    }

    return this.send(query, variableValues).then((response) => {
      response.model = path.reduce((object, key) => {
        return object[key];
      }, response.model);

      return response;
    });
  }

  /**
   * Fetches all subsequent pages of a paginated array of nodes.
   *
   * @example
   * client.fetchAllPages(nodes, {pageSize: 20}).then((result) => {
   *   // Do something with all the models
   *   console.log(result);
   * });
   *
   * @param {GraphModel[]} paginatedModels The list of nodes on which to fetch all pages.
   * @param {Object} options Options object containing:
   *   @param {Integer} options.pageSize The number of nodes to query on each page.
   * @return {Promise.<GraphModel[]>} A promise resolving with all pages of {@link GraphModel}s, including the original list.
   */
  fetchAllPages(paginatedModels, {pageSize}) {
    if (hasNextPage(paginatedModels)) {
      return this.fetchNextPage(paginatedModels, {first: pageSize}).then(({model}) => {
        const pages = paginatedModels.concat(model);

        return this.fetchAllPages(pages, {pageSize});
      });
    }

    return Promise.resolve(paginatedModels);
  }

  /**
   * Refetches a {@link GraphModel} whose type implements `Node`.
   *
   * @example
   * client.refetch(node).then((result) => {
   *   // Do something with the refetched node
   *   console.log(result);
   * });
   *
   * @param {GraphModel} nodeType A {@link GraphModel} whose type implements `Node`.
   * @return {Promise.<GraphModel>} The refetched {@link GraphModel}.
   */
  refetch(nodeType) {
    if (!nodeType) {
      throw new Error('\'client#refetch\' must be called with a non-null instance of a Node.');
    } else if (!nodeType.type.implementsNode) {
      throw new Error(`'client#refetch' must be called with a type that implements Node. Received ${nodeType.type.name}.`);
    }

    return this.send(nodeType.refetchQuery()).then(({model}) => model.node);
  }

  /**
   * Creates a variable to be used in a {@link Query} or {@link Mutation}.
   *
   * @example
   * const idVariable = client.variable('id', 'ID!', '12345');
   *
   * @param {String} name The name of the variable.
   * @param {String} type The GraphQL type of the variable.
   * @param {*} [defaultValue] The default value of the variable.
   * @return {VariableDefinition} A variable object that can be used in a {@link Query} or {@link Mutation}.
   */
  variable(name, type, defaultValue) {
    return variableFunction(name, type, defaultValue);
  }

  /**
   * Creates an enum to be used in a {@link Query} or {@link Mutation}.
   *
   * @example
   * const titleEnum = client.enum('TITLE');
   *
   * @param {String} key The key of the enum.
   * @return {Enum} An enum object that can be used in a {@link Query} or {@link Mutation}.
   */
  enum(key) {
    return enumFunction(key);
  }
}
