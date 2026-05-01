export function formatFormAnswerLabel(fieldId: string, fieldLabels: Record<string, string>): string {
    return fieldLabels[fieldId] || `Field ${fieldId}`
}
