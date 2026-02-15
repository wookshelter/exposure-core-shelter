import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { print } from "graphql";
import { gql, GraphQLClient, type Variables } from "graphql-request";

export { gql };

export const graphqlRequest = async <
  TData,
  TVariables extends Variables = Variables,
>(params: {
  url: string;
  document: TypedDocumentNode<TData, TVariables>;
  variables: TVariables;
  headers?: HeadersInit;
}): Promise<TData> => {
  const client = new GraphQLClient(params.url, {
    ...(params.headers ? { headers: params.headers } : {}),
  });

  const query = print(params.document);

  return client.request<TData, Variables>(query, params.variables);
};
