export function defineSchema(schema) {
    return {
        defaultConflict: 'remoteWins',
        ...schema,
    };
}
export function getFieldConflictPolicy(schema, entity, field) {
    const entityDefinition = schema.entities[entity];
    return (entityDefinition?.fields?.[field]?.conflict
        || entityDefinition?.conflict
        || schema.defaultConflict
        || 'remoteWins');
}
//# sourceMappingURL=schema.js.map