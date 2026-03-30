[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$DumpPath,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$ContainerName = 'backend-db-1',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$DatabaseUser = 'radiotedu_user',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$DatabaseName = 'radiotedu'
)

$ErrorActionPreference = 'Stop'

function Invoke-DockerCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        $commandText = ($Arguments -join ' ')
        throw "docker $commandText exited with code $LASTEXITCODE."
    }
}

try {
    $resolvedDumpPath = (Resolve-Path -LiteralPath $DumpPath -ErrorAction Stop).ProviderPath
    if (-not (Test-Path -LiteralPath $resolvedDumpPath -PathType Leaf)) {
        throw "Dump file not found: $resolvedDumpPath"
    }

    $dumpFileName = [System.IO.Path]::GetFileName($resolvedDumpPath)
    $containerDumpPath = "/tmp/restore-$([guid]::NewGuid().ToString('N'))-$dumpFileName"

    $targetDescription = "container '$ContainerName' database '$DatabaseName' as user '$DatabaseUser' from dump '$resolvedDumpPath'"
    if (-not $PSCmdlet.ShouldProcess($targetDescription, 'Restore PostgreSQL database with psql -f')) {
        return
    }

    Get-Command docker -ErrorAction Stop | Out-Null

    Invoke-DockerCommand -Arguments @(
        'cp'
        $resolvedDumpPath
        "$ContainerName`:$containerDumpPath"
    )

    try {
        Invoke-DockerCommand -Arguments @(
            'exec'
            '-e'
            'PGCLIENTENCODING=UTF8'
            $ContainerName
            'psql'
            '-U'
            $DatabaseUser
            '-d'
            $DatabaseName
            '-f'
            $containerDumpPath
        )
    }
    finally {
        try {
            Invoke-DockerCommand -Arguments @(
                'exec'
                $ContainerName
                'rm'
                '-f'
                $containerDumpPath
            )
        }
        catch {
            Write-Warning "Restore completed, but cleanup of '$containerDumpPath' in container '$ContainerName' failed: $($_.Exception.Message)"
        }
    }
}
catch {
    Write-Error $_
    exit 1
}
