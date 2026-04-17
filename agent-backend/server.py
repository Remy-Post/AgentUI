"""
Directory Structure:
backend -> ~/storage
            | -> Individual Session Dirs (n)
            |    | -> sessionID.json //Session data
            |    | -> sessionID.log //Session logs
            |    | -> sessionID.other //Keeping the rest of the logs for now

Schema 
sessionID: number

Session:
    sessionID: number
    createdAt: datetime
    updatedAt: date
    dir: str

Tools (class):
    name: str
    description | message: str
    parameters: dict
    execute: function

    usedAt(): datetime
    result() ? error(): bool | Error
    log(): void    
"""