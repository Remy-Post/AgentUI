export type Skill = {
    description: string
    prompt: string
    parameters?: Record<string, unknown>
}

const SKILLS = {
    // Add skills here, e.g.:
    // example_skill: {
    //     description: 'A short description of when to use this skill',
    //     prompt: 'Skill instructions / body content',
    // },
} as const satisfies Record<string, Skill>

export default SKILLS
