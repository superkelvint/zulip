import ClipboardJS from "clipboard";
import $ from "jquery";

import render_delete_topic_modal from "../templates/confirm_dialog/confirm_delete_topic.hbs";
import render_left_sidebar_topic_actions_popover from "../templates/popovers/left_sidebar/left_sidebar_topic_actions_popover.hbs";

import * as confirm_dialog from "./confirm_dialog";
import {$t_html} from "./i18n";
import * as message_edit from "./message_edit";
import * as popover_menus from "./popover_menus";
import * as popover_menus_data from "./popover_menus_data";
import * as starred_messages_ui from "./starred_messages_ui";
import {realm} from "./state_data";
import * as stream_popover from "./stream_popover";
import * as ui_util from "./ui_util";
import * as unread_ops from "./unread_ops";
import * as user_topics from "./user_topics";
import * as util from "./util";

export function initialize() {
    popover_menus.register_popover_menu(
        "#stream_filters .topic-sidebar-menu-icon, .inbox-row .inbox-topic-menu",
        {
            ...popover_menus.left_sidebar_tippy_options,
            onShow(instance) {
                popover_menus.popover_instances.topics_menu = instance;
                ui_util.show_left_sidebar_menu_icon(instance.reference);
                popover_menus.on_show_prep(instance);
                let stream_id;
                let topic_name;
                let url;

                if (instance.reference.classList.contains("inbox-topic-menu")) {
                    const $elt = $(instance.reference);
                    stream_id = Number.parseInt($elt.attr("data-stream-id"), 10);
                    topic_name = $elt.attr("data-topic-name");
                    url = new URL($elt.attr("data-topic-url"), realm.realm_url);
                } else {
                    const $elt = $(instance.reference)
                        .closest(".topic-sidebar-menu-icon")
                        .expectOne();
                    const $stream_li = $elt.closest(".narrow-filter").expectOne();
                    topic_name = $elt.closest("li").expectOne().attr("data-topic-name");
                    url = $elt.closest("li").find(".sidebar-topic-name").expectOne().prop("href");
                    stream_id = stream_popover.elem_to_stream_id($stream_li);
                }

                instance.context = popover_menus_data.get_topic_popover_content_context({
                    stream_id,
                    topic_name,
                    url,
                });
                instance.setContent(
                    ui_util.parse_html(render_left_sidebar_topic_actions_popover(instance.context)),
                );
            },
            onMount(instance) {
                const $popper = $(instance.popper);
                const {stream_id, topic_name} = instance.context;

                if (!stream_id) {
                    popover_menus.hide_current_popover_if_visible(instance);
                    return;
                }

                $popper.on("change", "input[name='sidebar-topic-visibility-select']", (e) => {
                    const start_time = Date.now();
                    const visibility_policy = Number.parseInt(
                        $(e.currentTarget).attr("data-visibility-policy"),
                        10,
                    );

                    const success_cb = () => {
                        setTimeout(
                            () => {
                                popover_menus.hide_current_popover_if_visible(instance);
                            },
                            util.get_remaining_time(start_time, 500),
                        );
                    };

                    const error_cb = () => {
                        const prev_visibility_policy = user_topics.get_topic_visibility_policy(
                            stream_id,
                            topic_name,
                        );
                        const $prev_visibility_policy_input = $(e.currentTarget)
                            .parent()
                            .find(`input[data-visibility-policy="${prev_visibility_policy}"]`);
                        setTimeout(
                            () => {
                                $prev_visibility_policy_input.prop("checked", true);
                            },
                            util.get_remaining_time(start_time, 500),
                        );
                    };

                    user_topics.set_user_topic_visibility_policy(
                        stream_id,
                        topic_name,
                        visibility_policy,
                        false,
                        false,
                        undefined,
                        success_cb,
                        error_cb,
                    );
                });

                $popper.one("click", ".sidebar-popover-unstar-all-in-topic", () => {
                    starred_messages_ui.confirm_unstar_all_messages_in_topic(
                        Number.parseInt(stream_id, 10),
                        topic_name,
                    );
                    popover_menus.hide_current_popover_if_visible(instance);
                });

                $popper.one("click", ".sidebar-popover-mark-topic-read", () => {
                    unread_ops.mark_topic_as_read(stream_id, topic_name);
                    popover_menus.hide_current_popover_if_visible(instance);
                });

                $popper.one("click", ".sidebar-popover-mark-topic-unread", () => {
                    unread_ops.mark_topic_as_unread(stream_id, topic_name);
                    popover_menus.hide_current_popover_if_visible(instance);
                });

                $popper.one("click", ".sidebar-popover-delete-topic-messages", () => {
                    const html_body = render_delete_topic_modal({topic_name});

                    confirm_dialog.launch({
                        html_heading: $t_html({defaultMessage: "Delete topic"}),
                        help_link: "/help/delete-a-topic",
                        html_body,
                        on_click() {
                            message_edit.delete_topic(stream_id, topic_name);
                        },
                    });

                    popover_menus.hide_current_popover_if_visible(instance);
                });

                $popper.one("click", ".sidebar-popover-toggle-resolved", () => {
                    message_edit.with_first_message_id(stream_id, topic_name, (message_id) => {
                        message_edit.toggle_resolve_topic(message_id, topic_name, true);
                    });

                    popover_menus.hide_current_popover_if_visible(instance);
                });

                $popper.one("click", ".sidebar-popover-move-topic-messages", () => {
                    stream_popover.build_move_topic_to_stream_popover(stream_id, topic_name, false);
                    popover_menus.hide_current_popover_if_visible(instance);
                });

                $popper.one("click", ".sidebar-popover-rename-topic-messages", () => {
                    stream_popover.build_move_topic_to_stream_popover(stream_id, topic_name, true);
                    popover_menus.hide_current_popover_if_visible(instance);
                });
                $popper.one("click", ".sidebar-popover-download-topic", () => {
                    var apiUrl = `/json/messages?anchor=newest&num_before=1000&num_after=0&client_gravatar=true&narrow=[{"negated":false,"operator":"channel","operand":${stream_id}},{"negated":false,"operator":"topic","operand":"${topic_name}"}]`;

                    // Fetch messages from the API
                    $.get(apiUrl, function(data) {
                        if (data.result === "success") {
                            var htmlContent = `
            <html>
                <head>
                    <title>Messages</title>
                    <link rel="stylesheet" href="https://unpkg.com/purecss@2.1.0/build/pure-min.css" integrity="sha384-q7UsqvN0HI2u++rCXzAR6DRjLsGH1GhRexFcl6tj9EtCI7DwCXdtk5CfI9L+7XB9" crossorigin="anonymous">
                    <style>
                    .container {
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        .message {
                            margin-bottom: 20px;
                            padding: 10px;
                            border: 1px solid #ddd;
                            border-radius: 5px;
                        }
                        .message-header {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 10px;
                        }
                        .message-header h3 {
                            margin: 0;
                            font-size: 1.2em;
                        }
                        .message-content {
                            margin: 10px 0;
                        }
                        .message hr {
                            border: none;
                        }
                    </style>
                </head>
                <body class="pure-g">
                <div class="container">
                    <div class="pure-u-1">
                        <h1>${topic_name}</h1>
                    </div>
                    <div class="pure-u-1">`;

            // Process each message
            data.messages.forEach(function(message) {
                htmlContent += `
                    <div class="message pure-u-1">
                        <div class="message-header">
                            <h3>${message.sender_full_name}</h3>
                            <span>${new Date(message.timestamp * 1000).toLocaleString()}</span>
                        </div>
                        <div class="message-content">
                            <p>${message.content}</p>
                        </div>
                    </div>`;
            });

            // Close the HTML content
            htmlContent += `
                    </div></div>
                </body>
            </html>`;

                            // Create a downloadable HTML file
                            var blob = new Blob([htmlContent], { type: "text/html" });
                            var url = URL.createObjectURL(blob);

                            // Create an anchor element for the download
                            var a = document.createElement('a');
                            a.href = url;
                            a.download = `${topic_name}.html`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        } else {
                            console.log("Failed to fetch messages: " + data.msg);
                        }
                    });

                    // stream_popover.build_move_topic_to_stream_popover(stream_id, topic_name, true);
                    popover_menus.hide_current_popover_if_visible(instance);
                });

                new ClipboardJS($popper.find(".sidebar-popover-copy-link-to-topic")[0]).on(
                    "success",
                    () => {
                        popover_menus.hide_current_popover_if_visible(instance);
                    },
                );
            },
            onHidden(instance) {
                instance.destroy();
                popover_menus.popover_instances.topics_menu = undefined;
                ui_util.hide_left_sidebar_menu_icon();
            },
        },
    );
}
