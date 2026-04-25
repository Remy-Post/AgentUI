import matter from 'gray-matter';
import * as path from 'path';
import { promises as fs } from 'fs';


export interface Skill {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

class SkillManager {
    private skills: Skill[] = [];
    static readonly PATH = 'C:\\Users\\debbi\\Downloads\\AgentUI\\agent-server\\skills';
    constructor() {}

    addSkill(skill: Skill) {
        if (this.skills.find(s => s.name === skill.name)) {
            throw new Error(`Skill ${skill.name} already exists`);
        }
        this.skills.push(skill);
    }

    
    createSkill(name: string, description: string, parameters: Record<string, any>) {
        const skill: Skill = {
            name: name,
            description: description,
            parameters: parameters
        };
        this.addSkill(skill);
    }

    removeSkill(name: string) {
        if (!this.skills.find(s => s.name === name)) {
            throw new Error(`Skill ${name} not found`);
        }
        this.skills = this.skills.filter(s => s.name !== name);
    }

    async loadSkills() {
        if (await fs.stat(SkillManager.PATH).then(stats => stats.isDirectory())) {
            const files = await fs.readdir(SkillManager.PATH);
            for (const file of files) {
                const skill = await fs.readFile(path.join(SkillManager.PATH, file), 'utf8');
                this.skills.push({
                    name: file.split('.')[0],
                    description: matter(skill).data.description as string,
                    parameters: matter(skill).data.parameters as Record<string, any>
                });
            }
        }
    }

    async saveSkills() {

    }
}