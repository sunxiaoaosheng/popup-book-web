# 源码 formula。不安装签名过的 .app。
# 稳定版的 url/sha256 要等 Release 资产出来再填，见 docs/RELEASE.md。
# 在那之前只用 --HEAD。head 分支在并进 main 之后改成 main。
class PopupBook < Formula
  desc "Paper pop-up book driven by a MacBook lid angle"
  homepage "https://github.com/sunxiaoaosheng/popup-book-web"
  license "MIT"
  head "https://github.com/sunxiaoaosheng/popup-book-web.git", branch: "creative/v9-packaging"

  depends_on "python@3.12"

  def install
    libexec.install "frontend", "backend", "start.sh", "packaging", "docs",
                    "README.md", "LICENSE", "CHANGELOG.md"
    chmod 0755, libexec/"start.sh"
    chmod 0755, libexec/"packaging/popup-book"
    (bin/"popup-book").write <<~SH
      #!/bin/bash
      export PATH="#{Formula["python@3.12"].opt_bin}:$PATH"
      exec "#{libexec}/packaging/popup-book" "$@"
    SH
  end

  def caveats
    <<~EOS
      这是源码安装，不签名、不上架。没有 Apple Developer ID。
      命令是 popup-book，它执行仓库里的 ./start.sh。
      真实合页仍要在 macOS 上先 brew install hidapi，再 popup-book --sensor。
      未签名的 .app / .dmg 见 packaging/mac/README.md。Gatekeeper 会拦截。
      买开发者账号之前，用这个 formula，不要用 cask。
      日常改代码仍在克隆下来的仓库里用 ./start.sh。
    EOS
  end

  test do
    assert_match "用法", shell_output("#{bin}/popup-book --help")
  end
end
