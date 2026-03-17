import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = pkg.version
const major = version.split('.')[0]

const exec = (cmd) => execSync(cmd, { stdio: 'inherit' })

exec('git config user.email "github-actions[bot]@users.noreply.github.com"')
exec('git config user.name "github-actions[bot]"')

// dist/ をコミット (追跡済みファイルなので --force 不要)
exec('git add dist/')
exec(`git commit -m "chore: build dist for v${version} [skip ci]"`)

// changeset tag で v{version} タグを作成
exec('pnpm changeset tag')

// メジャー浮動タグを作成/更新 (v1, v2, ...)
exec(`git tag -f v${major}`)

// コミット + 全タグを push
exec('git push --follow-tags')
exec(`git push origin v${major} --force`)
