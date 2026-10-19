/** Node-only: syntax-tree parsing, the CodeBody builder, body inputs and the mutation engine. */
export { calls, findDefinition, functionStatements, identifiers, parameterNames, parse, type Stmt } from "./ast.ts";
export { type BuildInput, type BuiltBody, buildBody, type CallEdge } from "./body.ts";
export { type Env, evaluate, NotEvaluable, same, show, truthy, type Value } from "./evaluator.ts";
export {
  assertionInputs,
  candidateInputs,
  conditionInputs,
  evaluatorInputs,
  heartLiterals,
  literalConstants,
  moduleConstants,
  type Outcome,
  trace,
  UNKNOWN,
} from "./inputs.ts";
export { type Mutation, mutate } from "./mutation.ts";
export { bodyForSymbol, exactEdges, type SourceText } from "./source.ts";
