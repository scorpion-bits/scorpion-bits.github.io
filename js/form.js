/* ScorpionBits — formulário "Solicitar serviço" (solicitar.html).

   O site é estático, então o envio vai para o Formspree: o endereço fica no
   atributo `action` do <form>, e é o único lugar a configurar. Nenhuma chave
   ou senha mora aqui — o ID do Formspree é público por natureza.

   O que este arquivo faz:
   1. pré-seleciona o tipo de serviço a partir de ?servico=<chave>;
   2. valida os campos obrigatórios com mensagens em português;
   3. envia por fetch e mostra sucesso ou erro sem sair da página;
   4. se o Formspree ainda não foi configurado (ou o envio falhar), oferece o
      mesmo pedido por e-mail, já escrito. */
(() => {
    "use strict";

    const form = document.querySelector("[data-form]");
    if (!form) return;

    const EMAIL = "scorpionbits.contato@gmail.com";
    const status = form.querySelector("[data-status]");
    const botao = form.querySelector("[data-enviar]");
    const ok = document.querySelector("[data-form-ok]");
    const configurado = !/SEU_ID_AQUI/.test(form.action);

    /* ---------------------------------------- serviço vindo da URL -- */
    const servico = form.elements.servico;
    const chave = new URLSearchParams(location.search).get("servico");
    if (chave && servico) {
        const opcao = [...servico.options].find((o) => o.dataset.chave === chave);
        if (opcao) servico.value = opcao.value;
    }

    /* ------------------------------------------------- validação -- */
    const MENSAGENS = {
        nome: "Informe o seu nome.",
        email: "Informe um e-mail válido, como nome@exemplo.com.",
        servico: "Escolha o tipo de serviço.",
        ideia: "Conte um pouco da sua ideia.",
        autorizacao: "Marque a autorização para podermos responder.",
    };

    const erroDe = (campo) => document.getElementById(
        (campo.getAttribute("aria-describedby") || "").split(" ").find((id) => id.startsWith("e-"))
    );

    const validar = (campo) => {
        const valido = campo.type === "checkbox"
            ? campo.checked
            : campo.value.trim() !== "" && campo.checkValidity();
        const saida = erroDe(campo);
        campo.setAttribute("aria-invalid", valido ? "false" : "true");
        if (saida) saida.textContent = valido ? "" : MENSAGENS[campo.name] || "Preencha este campo.";
        return valido;
    };

    const obrigatorios = [...form.querySelectorAll("[required]")];
    obrigatorios.forEach((campo) => {
        campo.addEventListener("blur", () => validar(campo));
        campo.addEventListener(campo.type === "checkbox" || campo.tagName === "SELECT" ? "change" : "input", () => {
            if (campo.getAttribute("aria-invalid") === "true") validar(campo);
        });
    });

    /* --------------------------------------------------- mensagens -- */
    const avisar = (tipo, texto, link) => {
        status.dataset.tipo = tipo;
        status.textContent = texto;
        if (link) {
            const a = document.createElement("a");
            a.href = link.href;
            a.textContent = link.texto;
            status.append(" ", a);
        }
    };

    const ROTULOS = [
        ["nome", "Nome"], ["email", "E-mail"], ["whatsapp", "WhatsApp"],
        ["empresa", "Empresa ou instituição"], ["servico", "Tipo de serviço"],
        ["ideia", "Ideia"], ["prazo", "Prazo desejado"],
        ["orcamento", "Faixa de orçamento"], ["como_conheceu", "Como nos conheceu"],
    ];

    // o mesmo pedido, como e-mail já escrito: plano B que não depende de serviço nenhum
    const mailto = () => {
        const corpo = ROTULOS
            .map(([nome, rotulo]) => [rotulo, (form.elements[nome].value || "").trim()])
            .filter(([, valor]) => valor)
            .map(([rotulo, valor]) => `${rotulo}: ${valor}`)
            .join("\n");
        const assunto = `Pedido de serviço: ${form.elements.servico.value || "ScorpionBits"}`;
        return `mailto:${EMAIL}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(
            corpo + "\n\nAutorizo a ScorpionBits a usar estes dados para responder ao meu pedido."
        )}`;
    };

    const sucesso = () => {
        form.hidden = true;
        ok.hidden = false;
        ok.focus();
        ok.scrollIntoView({ block: "center" });
    };

    /* ------------------------------------------------------ envio -- */
    form.addEventListener("submit", async (ev) => {
        ev.preventDefault();

        const invalidos = obrigatorios.filter((campo) => !validar(campo));
        if (invalidos.length) {
            avisar("erro", "Faltou preencher: confira os campos marcados.");
            invalidos[0].focus();
            return;
        }

        // honeypot preenchido = robô: finge que deu certo e não envia nada
        if (form.elements._gotcha.value) return sucesso();

        if (!configurado) {
            avisar("erro", "O envio pelo site ainda está sendo configurado.", {
                href: mailto(),
                texto: "Enviar este pedido por e-mail",
            });
            return;
        }

        botao.disabled = true;
        avisar("info", "Enviando…");

        try {
            const resposta = await fetch(form.action, {
                method: "POST",
                body: new FormData(form),
                headers: { Accept: "application/json" },
            });
            if (!resposta.ok) throw new Error(String(resposta.status));
            sucesso();
        } catch (e) {
            avisar("erro", "Não foi possível enviar agora. Tente de novo ou", {
                href: mailto(),
                texto: "envie este pedido por e-mail.",
            });
        } finally {
            botao.disabled = false;
        }
    });
})();
