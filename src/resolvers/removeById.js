/* @flow */
/* eslint-disable no-param-reassign */

import {
  GraphQLObjectType,
  GraphQLNonNull,
} from 'graphql';
import { Resolver, TypeComposer } from 'graphql-compose';
import findById from './findById';
import GraphQLMongoID from '../types/mongoid';
import typeStorage from '../typeStorage';
import type {
  MongooseModelT,
  ExtendedResolveParams,
  genResolverOpts,
} from '../definition';


export default function removeById(
  model: MongooseModelT,
  typeComposer: TypeComposer,
  opts?: genResolverOpts // eslint-disable-line no-unused-vars
): Resolver {
  if (!model || !model.modelName || !model.schema) {
    throw new Error(
      'First arg for Resolver removeById() should be instance of Mongoose Model.'
    );
  }

  if (!(typeComposer instanceof TypeComposer)) {
    throw new Error(
      'Second arg for Resolver removeById() should be instance of TypeComposer.'
    );
  }

  const findByIdResolver = findById(model, typeComposer);

  const outputTypeName = `RemoveById${typeComposer.getTypeName()}Payload`;
  const outputType = typeStorage.getOrSet(
    outputTypeName,
    new GraphQLObjectType({
      name: outputTypeName,
      fields: {
        recordId: {
          type: GraphQLMongoID,
          description: 'Removed document ID',
        },
        record: {
          type: typeComposer.getType(),
          description: 'Removed document',
        },
      },
    })
  );

  const resolver = new Resolver({
    name: 'removeById',
    kind: 'mutation',
    description: 'Remove one document: '
               + '1) Retrieve one document and remove with hooks via findByIdAndRemove. '
               + '2) Return removed document.',
    type: outputType,
    args: {
      _id: {
        name: '_id',
        type: new GraphQLNonNull(GraphQLMongoID),
      },
    },
    // $FlowFixMe
    resolve: (resolveParams: ExtendedResolveParams) => {
      const args = resolveParams.args || {};

      if (!args._id) {
        return Promise.reject(
          new Error(`${typeComposer.getTypeName()}.removeById resolver requires args._id value`)
        );
      }

      // We should get all data for document, cause Mongoose model may have hooks/middlewares
      // which required some fields which not in graphql projection
      // So empty projection returns all fields.
      resolveParams.projection = {};

      // $FlowFixMe
      return findByIdResolver.resolve(resolveParams)
        .then((doc) => {
          // $FlowFixMe
          if (resolveParams.beforeRecordMutate) {
            return resolveParams.beforeRecordMutate(doc, resolveParams);
          }
          return doc;
        })
        // remove record from DB
        .then((doc) => {
          if (!doc) {
            return Promise.reject(new Error('Document not found'));
          }
          return doc.remove();
        })
        // prepare output payload
        .then((record) => {
          if (record) {
            return {
              record,
              recordId: typeComposer.getRecordIdFn()(record),
            };
          }

          return {
            recordId: args._id,
          };
        });
    },
  });

  return resolver;
}
