pub fn makeGreeting(
	args: &[std::rc::Rc<qwik_ssr_rt::serdes::SerdesValue>],
) -> std::rc::Rc<qwik_ssr_rt::serdes::SerdesValue> {
	let name = match &*args[0] {
		qwik_ssr_rt::serdes::SerdesValue::String(text) => text.clone(),
		_ => String::new(),
	};
	std::rc::Rc::new(qwik_ssr_rt::serdes::SerdesValue::String(format!(
		"hello {name}"
	)))
}
